import "server-only";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/request";
import { formatDateTime, relativeDue } from "@/lib/dates";
import { TIER_ORDER } from "@/lib/constants";
import { enqueue, resolveTargetId, type NewJob } from "@/lib/teams/outbox";
import { graphAvailable } from "@/lib/teams/config";
import type { NotificationKind, NotificationRule, Priority } from "@prisma/client";

/**
 * What the portal decides to say, and to whom.
 *
 * The layer above the transport. Nothing here knows what an Adaptive Card is;
 * it knows that a task became somebody's problem, that a deadline is a day out,
 * and which department switched that kind of message on.
 *
 * Every function is safe to call and forget. They are invoked from Server
 * Actions that have already committed their real work, so a failure to notify
 * must never propagate — the assignment exists whether or not Teams heard
 * about it.
 */

const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };

/**
 * How long a task keeps generating overdue reminders after its deadline.
 *
 * Two weeks. Past that it is not a deadline anybody forgot, it is a task that
 * needs a conversation, and a daily notification is not going to be the thing
 * that starts one.
 */
const OVERDUE_GRACE_DAYS = 14;

/**
 * The rule that applies to a department for one kind of event.
 *
 * A department row wins over the portal-wide row, which is how a head turns
 * their own team's reminders on without changing anybody else's. No row at all
 * means off: notifications are opt-in, because the alternative is a deployment
 * that starts posting into a staff channel the moment somebody pastes a URL in.
 */
export async function ruleFor(
  kind: NotificationKind,
  departmentId: string | null,
): Promise<NotificationRule | null> {
  const rows = await db.notificationRule.findMany({
    where: { kind, OR: [{ departmentId }, { departmentId: null }] },
  });

  const specific = rows.find((row) => row.departmentId === departmentId);
  const fallback = rows.find((row) => row.departmentId === null);
  const rule = specific ?? fallback ?? null;

  return rule && rule.enabled ? rule : null;
}

/** Absolute link back into the portal, so a Teams card can be clicked. */
async function link(path: string): Promise<string> {
  return `${await appOrigin()}${path}`;
}

/** People who should be @mentioned, filtered to those with Teams linked. */
async function mentionable(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const linked = await db.teamsIdentity.findMany({
    where: { userId: { in: userIds }, optedOut: false },
    select: { userId: true },
  });
  return linked.map((row) => row.userId);
}

/**
 * Personal pings for a list of people.
 *
 * Separate rows rather than one row with many recipients, because delivery
 * succeeds and fails per person: one member who never installed the Teams app
 * should not mark the notification to the other four as failed.
 */
async function personalJobs(
  base: Omit<NewJob, "recipientUserId" | "targetId" | "dedupeKey">,
  userIds: string[],
  dedupePrefix: string | null,
): Promise<NewJob[]> {
  if (!graphAvailable()) return [];
  const reachable = await mentionable(userIds);
  return reachable.map((userId) => ({
    ...base,
    recipientUserId: userId,
    targetId: null,
    mentionUserIds: [],
    dedupeKey: dedupePrefix ? `${dedupePrefix}:user:${userId}` : null,
  }));
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/**
 * An announcement was posted.
 *
 * `force` is the checkbox on the composer: a head who ticks "also send to
 * Teams" means it, whether or not the standing rule for announcements is on.
 * The rule is the default behaviour, not a veto over an explicit instruction.
 */
export async function notifyAnnouncement(input: {
  announcementId: string;
  title: string;
  body: string;
  departmentId: string | null;
  authorName: string;
  authorId: string;
  pinned: boolean;
  force: boolean;
}): Promise<number> {
  try {
    const rule = await ruleFor("ANNOUNCEMENT", input.departmentId);
    if (!rule && !input.force) return 0;

    const targetId = rule?.targetId ?? (await resolveTargetId(input.departmentId));
    if (!targetId) return 0;

    return await enqueue([
      {
        kind: "ANNOUNCEMENT",
        title: input.title,
        body: input.body,
        url: await link("/announcements"),
        priority: input.pinned ? "HIGH" : "MEDIUM",
        departmentId: input.departmentId,
        targetId,
        sourceType: "announcement",
        sourceId: input.announcementId,
        createdById: input.authorId,
        dedupeKey: `announcement:${input.announcementId}`,
      },
    ]);
  } catch (error) {
    console.error("[teams] announcement notification failed", error);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/** A task was created, or somebody new was put on it. */
export async function notifyNewAssignment(input: {
  assignmentId: string;
  title: string;
  departmentId: string;
  assigneeIds: string[];
  dueDate: Date | null;
  priority: Priority;
  createdById: string;
  createdByName: string;
}): Promise<number> {
  try {
    const rule = await ruleFor("ASSIGNMENT_NEW", input.departmentId);
    if (!rule) return 0;
    if (PRIORITY_RANK[input.priority] < PRIORITY_RANK[rule.minPriority]) return 0;

    const targetId = rule.targetId ?? (await resolveTargetId(input.departmentId));
    const url = await link(`/assignments/${input.assignmentId}`);
    const body = [
      `${input.createdByName} assigned this.`,
      input.dueDate ? relativeDue(input.dueDate) : "No due date set.",
    ].join(" ");

    const jobs: NewJob[] = [];

    if (targetId) {
      jobs.push({
        kind: "ASSIGNMENT_NEW",
        title: input.title,
        body,
        url,
        priority: input.priority,
        departmentId: input.departmentId,
        targetId,
        mentionUserIds: await mentionable(input.assigneeIds),
        sourceType: "assignment",
        sourceId: input.assignmentId,
        createdById: input.createdById,
        dedupeKey: `assignment-new:${input.assignmentId}`,
      });
    }

    if (rule.pingPeople) {
      jobs.push(
        ...(await personalJobs(
          {
            kind: "ASSIGNMENT_NEW",
            title: input.title,
            body,
            url,
            priority: input.priority,
            departmentId: input.departmentId,
            sourceType: "assignment",
            sourceId: input.assignmentId,
            createdById: input.createdById,
          },
          input.assigneeIds,
          `assignment-new:${input.assignmentId}`,
        )),
      );
    }

    return await enqueue(jobs);
  } catch (error) {
    console.error("[teams] assignment notification failed", error);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// The scheduled scans
// ---------------------------------------------------------------------------

/** Bangkok's calendar day for a timestamp, used to make a reminder once-a-day. */
function bangkokDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(at);
}

/**
 * Deadlines, swept once per dispatch run.
 *
 * The dedupe key carries the Bangkok date, so a task that is due on Friday
 * produces one reminder on Thursday and one on Friday rather than one every
 * time the dispatcher wakes up. That is the whole trick: the schedule can be
 * as frequent as it likes without the messages being.
 */
export async function scanDueAssignments(): Promise<number> {
  const now = new Date();
  const today = bangkokDay(now);

  const rules = await db.notificationRule.findMany({
    where: { enabled: true, kind: { in: ["ASSIGNMENT_DUE", "ASSIGNMENT_OVERDUE"] } },
  });
  if (rules.length === 0) return 0;

  const jobs: NewJob[] = [];
  const origin = await appOrigin();

  for (const rule of rules) {
    const overdue = rule.kind === "ASSIGNMENT_OVERDUE";

    // Overdue reminders stop after a fortnight. Without a floor, a task
    // abandoned last term is chased every single day forever, and a channel
    // that cries wolf daily is a channel people mute — which costs the
    // reminders that do matter.
    const window = overdue
      ? { lt: now, gte: new Date(now.getTime() - OVERDUE_GRACE_DAYS * 86_400_000) }
      : { gt: now, lte: new Date(now.getTime() + rule.leadHours * 3_600_000) };

    const assignments = await db.assignment.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ["DONE", "APPROVED"] },
        dueDate: window,
        ...(rule.departmentId ? { departmentId: rule.departmentId } : {}),
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        departmentId: true,
        assignees: { select: { userId: true } },
      },
      // A bound, so one forgotten department cannot make a dispatch run
      // unbounded. Anything past it is picked up on the next run.
      take: 100,
    });

    for (const assignment of assignments) {
      if (PRIORITY_RANK[assignment.priority] < PRIORITY_RANK[rule.minPriority]) continue;

      const targetId = rule.targetId ?? (await resolveTargetId(assignment.departmentId));
      const assigneeIds = assignment.assignees.map((a) => a.userId);
      const url = `${origin}/assignments/${assignment.id}`;
      const stem = `${overdue ? "overdue" : "due"}:${assignment.id}:${today}`;

      const body = overdue
        ? `${relativeDue(assignment.dueDate)}. It is still open.`
        : `${relativeDue(assignment.dueDate)} — ${formatDateTime(assignment.dueDate)}.`;

      if (targetId) {
        jobs.push({
          kind: rule.kind,
          title: assignment.title,
          body,
          url,
          priority: overdue ? "URGENT" : assignment.priority,
          departmentId: assignment.departmentId,
          targetId,
          mentionUserIds: await mentionable(assigneeIds),
          sourceType: "assignment",
          sourceId: assignment.id,
          dedupeKey: stem,
        });
      }

      if (rule.pingPeople) {
        jobs.push(
          ...(await personalJobs(
            {
              kind: rule.kind,
              title: assignment.title,
              body,
              url,
              priority: overdue ? "URGENT" : assignment.priority,
              departmentId: assignment.departmentId,
              sourceType: "assignment",
              sourceId: assignment.id,
            },
            assigneeIds,
            stem,
          )),
        );
      }
    }
  }

  return enqueue(jobs);
}

/**
 * The run sheet, for the three days when it is the only thing that matters.
 *
 * Event items carry a day and a start time as strings rather than a timestamp,
 * because that is how a run sheet is written and edited. They are combined into
 * a Bangkok instant here, which is the one place that conversion needs to
 * happen.
 */
export async function scanUpcomingEvents(): Promise<number> {
  const rule = await db.notificationRule.findFirst({
    where: { kind: "EVENT_SOON", enabled: true, departmentId: null },
  });
  if (!rule) return 0;

  const now = new Date();
  const today = bangkokDay(now);
  const horizon = new Date(now.getTime() + rule.leadHours * 3_600_000);

  const items = await db.eventItem.findMany({
    where: { day: today },
    orderBy: { startTime: "asc" },
    take: 50,
  });
  if (items.length === 0) return 0;

  const targetId = rule.targetId ?? (await resolveTargetId(null));
  if (!targetId) return 0;

  const origin = await appOrigin();
  const jobs: NewJob[] = [];

  for (const item of items) {
    const startsAt = bangkokInstant(item.day, item.startTime);
    if (!startsAt || startsAt <= now || startsAt > horizon) continue;

    jobs.push({
      kind: "EVENT_SOON",
      title: item.title,
      body: [item.startTime, item.location ? `· ${item.location}` : "", item.notes ?? ""]
        .filter(Boolean)
        .join(" ")
        .trim(),
      url: `${origin}/event`,
      priority: "HIGH",
      targetId,
      sourceType: "event",
      sourceId: item.id,
      dedupeKey: `event:${item.id}:${today}`,
    });
  }

  return enqueue(jobs);
}

/**
 * "2027-03-20" plus "08:30" as a real instant.
 *
 * Bangkok does not observe daylight saving and has been UTC+7 since 1920, so
 * the offset is a constant rather than something to look up. Written out
 * because a fixed offset that is *documented* as fixed is safer than one that
 * looks like an oversight.
 */
const BANGKOK_OFFSET_MINUTES = 7 * 60;

export function bangkokInstant(day: string, time: string): Date | null {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!dayMatch || !timeMatch) return null;

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (hours > 23 || minutes > 59) return null;

  const utc = Date.UTC(
    Number(dayMatch[1]),
    Number(dayMatch[2]) - 1,
    Number(dayMatch[3]),
    hours,
    minutes,
  );
  return new Date(utc - BANGKOK_OFFSET_MINUTES * 60_000);
}

/**
 * Who a head may send a message to.
 *
 * Used by the composer to fill the recipient list. A head sees their own
 * department; an admin sees everybody. Deliberately excludes anybody without a
 * Teams identity from the *personal* list, since a ping the portal cannot
 * deliver is worse than an option that was never offered.
 */
export async function notifiablePeople(viewer: {
  id: string;
  tier: keyof typeof TIER_ORDER;
  departmentId: string | null;
}): Promise<{ id: string; name: string; departmentName: string | null; linked: boolean }[]> {
  const everyone = TIER_ORDER[viewer.tier] >= TIER_ORDER.T3_ADMIN;

  const people = await db.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(everyone ? {} : { departmentId: viewer.departmentId ?? "__none__" }),
    },
    orderBy: [{ department: { sortOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nickname: true,
      department: { select: { name: true } },
      teamsIdentity: { select: { optedOut: true } },
    },
  });

  return people.map((person) => ({
    id: person.id,
    name: person.nickname ?? person.name,
    departmentName: person.department?.name ?? null,
    linked: person.teamsIdentity !== null && !person.teamsIdentity.optedOut,
  }));
}
