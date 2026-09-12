import "server-only";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { buildCard, previewLine, type CardMention } from "@/lib/teams/card";
import { postToWebhook, type SendResult } from "@/lib/teams/webhook";
import { sendActivityNotification } from "@/lib/teams/graph";
import { DISPATCH_BATCH, MAX_ATTEMPTS, RETRY_BACKOFF_MINUTES, graphAvailable } from "@/lib/teams/config";
import type { NotificationJob, NotificationKind, Priority } from "@prisma/client";

/**
 * The queue, and the thing that drains it.
 *
 * Nothing in the portal talks to Teams while a person waits. A head clicks
 * "Send", a row lands in `notification_jobs`, and the action returns — the
 * announcement is saved whether or not Microsoft is having a morning. The
 * dispatcher (see src/app/api/teams/dispatch/route.ts) is what actually posts,
 * on a schedule, and what records the failure in a place an admin can read.
 *
 * The cost of that choice is honest and worth stating: a message is not
 * delivered the instant it is written, it is delivered on the next dispatch
 * run. For "the deadline moved" that is exactly right. For "the fire alarm is
 * real" it is not, which is why the composer says how often the dispatcher runs
 * rather than implying anything is instant.
 */

export type NewJob = {
  kind: NotificationKind;
  title: string;
  body: string;
  url?: string | null;
  priority?: Priority;
  departmentId?: string | null;
  targetId?: string | null;
  recipientUserId?: string | null;
  mentionUserIds?: string[];
  sourceType?: string | null;
  sourceId?: string | null;
  createdById?: string | null;
  /** Unique per logical message; a repeat is dropped by the database. */
  dedupeKey?: string | null;
  notBefore?: Date;
};

// ---------------------------------------------------------------------------
// Where a message goes
// ---------------------------------------------------------------------------

/**
 * The channel a department's messages belong in.
 *
 * Falls back rather than failing: a department with its own channel gets it, a
 * department without one goes to the all-staff channel, and a portal with
 * neither queues nothing at all. The last case is the normal state of a fresh
 * deployment and must not be an error.
 */
export async function resolveTargetId(departmentId: string | null): Promise<string | null> {
  if (departmentId) {
    const own = await db.teamsTarget.findFirst({
      where: { departmentId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (own) return own.id;
  }

  const shared = await db.teamsTarget.findFirst({
    where: { departmentId: null, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return shared?.id ?? null;
}

// ---------------------------------------------------------------------------
// Queueing
// ---------------------------------------------------------------------------

/**
 * Adds messages to the queue.
 *
 * `skipDuplicates` plus the unique index on `dedupeKey` is what makes a
 * reminder idempotent. Two dispatch runs overlapping, or a head clicking a
 * button twice, produce one row and one message — decided by the database
 * rather than by a read-then-write in application code that both callers could
 * interleave inside.
 *
 * Never throws. A notification that cannot be queued must not roll back the
 * assignment that triggered it; the work is the point, the message is the
 * courtesy.
 */
export async function enqueue(jobs: NewJob[]): Promise<number> {
  const rows = jobs
    .filter((job) => job.targetId || job.recipientUserId)
    .map((job) => ({
      kind: job.kind,
      title: job.title.slice(0, 190),
      body: job.body.slice(0, 6000),
      url: job.url ?? null,
      priority: job.priority ?? ("MEDIUM" as Priority),
      departmentId: job.departmentId ?? null,
      targetId: job.targetId ?? null,
      recipientUserId: job.recipientUserId ?? null,
      mentionUserIds: job.mentionUserIds?.length ? job.mentionUserIds.slice(0, 25) : undefined,
      sourceType: job.sourceType ?? null,
      sourceId: job.sourceId ?? null,
      createdById: job.createdById ?? null,
      dedupeKey: job.dedupeKey ? job.dedupeKey.slice(0, 190) : null,
      notBefore: job.notBefore ?? new Date(),
    }));

  if (rows.length === 0) return 0;

  try {
    const result = await db.notificationJob.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  } catch (error) {
    console.error("[teams] could not queue notifications", error);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** How long a claimed job is held before another run may pick it up again. */
const LEASE_MINUTES = 5;

/**
 * How long to wait before attempt number `attempt + 1`.
 *
 * `attempt` is 1-based and the table is 0-based, hence the subtraction: the
 * first failure waits RETRY_BACKOFF_MINUTES[0]. Getting this off by one is
 * invisible — the queue still drains, just on a different curve than the one
 * written down — so it is spelled out rather than left to the reader.
 */
function backoffMinutes(attempt: number): number {
  const index = Math.min(Math.max(attempt - 1, 0), RETRY_BACKOFF_MINUTES.length - 1);
  return RETRY_BACKOFF_MINUTES[index];
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

/**
 * The @mention list, resolved from portal accounts to Teams ones.
 *
 * A portal account with no Teams identity is simply not mentioned. Guessing at
 * a UPN from the email address would usually be right and occasionally ping a
 * stranger who happens to hold that address in the tenant, which is a worse
 * failure than a card that reads slightly flatter.
 */
async function resolveMentions(userIds: string[]): Promise<CardMention[]> {
  if (userIds.length === 0) return [];

  const identities = await db.teamsIdentity.findMany({
    where: { userId: { in: userIds }, optedOut: false },
    select: { upn: true, aadObjectId: true, displayName: true, user: { select: { name: true, nickname: true } } },
  });

  return identities.map((identity) => ({
    id: identity.aadObjectId ?? identity.upn,
    name: identity.displayName ?? identity.user.nickname ?? identity.user.name,
  }));
}

function mentionIdsOf(job: NotificationJob): string[] {
  const raw = job.mentionUserIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string").slice(0, 25);
}

/** Sends one job. Does not touch its row — see `dispatch()` for that. */
async function deliver(job: NotificationJob): Promise<SendResult> {
  // A personal ping: Graph, or nothing.
  if (job.recipientUserId) {
    if (!graphAvailable()) {
      return {
        ok: false,
        retryable: false,
        error: "Personal Teams notifications need Microsoft Graph, which is not configured.",
      };
    }

    const identity = await db.teamsIdentity.findUnique({
      where: { userId: job.recipientUserId },
      select: { upn: true, aadObjectId: true, optedOut: true },
    });

    if (!identity) {
      return { ok: false, retryable: false, error: "That person has no Teams account linked." };
    }
    if (identity.optedOut) {
      return { ok: false, retryable: false, error: "That person has personal pings turned off." };
    }

    return sendActivityNotification({
      recipientId: identity.aadObjectId ?? identity.upn,
      preview: previewLine({ kind: job.kind, title: job.title }),
      // Graph refuses a notification with no destination, and a portal link is
      // the only sensible one.
      url: job.url ?? "https://teams.microsoft.com",
    });
  }

  // A channel post.
  if (!job.targetId) {
    return { ok: false, retryable: false, error: "No Teams channel is connected for this message." };
  }

  const target = await db.teamsTarget.findUnique({
    where: { id: job.targetId },
    select: { webhookUrl: true, isActive: true, department: { select: { name: true } } },
  });

  if (!target) return { ok: false, retryable: false, error: "That Teams channel was removed." };
  if (!target.isActive) return { ok: false, retryable: false, error: "That Teams channel is switched off." };

  const url = decryptField(target.webhookUrl);
  if (!url) {
    // Ciphertext the current AUTH_SECRET cannot open. Retrying will not help;
    // the admin has to paste the webhook URL again.
    return { ok: false, retryable: false, error: "The stored webhook URL could not be read. Re-add the channel." };
  }

  const mentions = await resolveMentions(mentionIdsOf(job));

  return postToWebhook(
    url,
    buildCard({
      kind: job.kind,
      title: job.title,
      body: job.body,
      url: job.url,
      priority: job.priority,
      eyebrow: target.department?.name ?? null,
      mentions,
    }),
  );
}

export type DispatchReport = {
  claimed: number;
  sent: number;
  failed: number;
  retrying: number;
};

/**
 * Sends what is due, and records what happened.
 *
 * Jobs are claimed one at a time with a conditional update: the row moves only
 * if it is still QUEUED and still due, so two dispatch runs that overlap cannot
 * both send the same message. The claim pushes `notBefore` out by a lease, so a
 * run that dies halfway — a Render restart mid-request — leaves its job to be
 * retried in five minutes rather than stuck forever in a "sending" state that
 * nothing ever clears.
 */
export async function dispatch(limit = DISPATCH_BATCH): Promise<DispatchReport> {
  const report: DispatchReport = { claimed: 0, sent: 0, failed: 0, retrying: 0 };

  const due = await db.notificationJob.findMany({
    where: { status: "QUEUED", notBefore: { lte: new Date() } },
    orderBy: [{ priority: "desc" }, { notBefore: "asc" }],
    take: Math.min(limit, DISPATCH_BATCH),
  });

  for (const job of due) {
    const claim = await db.notificationJob.updateMany({
      where: { id: job.id, status: "QUEUED", notBefore: { lte: new Date() } },
      data: { attempts: { increment: 1 }, notBefore: minutesFromNow(LEASE_MINUTES) },
    });
    if (claim.count !== 1) continue; // another run got there first

    report.claimed += 1;
    const attempt = job.attempts + 1;

    let result: SendResult;
    try {
      result = await deliver(job);
    } catch (error) {
      // A bug in card building must not stop the queue draining.
      result = {
        ok: false,
        retryable: false,
        error: error instanceof Error ? error.message.slice(0, 200) : "Unknown error while sending.",
      };
    }

    if (result.ok) {
      await db.notificationJob.update({
        where: { id: job.id },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      if (job.targetId) {
        await db.teamsTarget.update({
          where: { id: job.targetId },
          data: { sendCount: { increment: 1 }, lastOkAt: new Date(), lastError: null },
        });
      }
      report.sent += 1;
      continue;
    }

    const giveUp = !result.retryable || attempt >= MAX_ATTEMPTS;

    await db.notificationJob.update({
      where: { id: job.id },
      data: giveUp
        ? { status: "FAILED", lastError: result.error.slice(0, 500) }
        : { status: "QUEUED", notBefore: minutesFromNow(backoffMinutes(attempt)), lastError: result.error.slice(0, 500) },
    });

    if (job.targetId) {
      await db.teamsTarget.update({
        where: { id: job.targetId },
        data: { lastErrorAt: new Date(), lastError: result.error.slice(0, 500) },
      });
    }

    if (giveUp) report.failed += 1;
    else report.retrying += 1;
  }

  return report;
}

/**
 * Sends one message immediately, for the "Send a test" button.
 *
 * The only path that skips the queue, and only because its whole purpose is to
 * answer "is this webhook URL right" while the admin is still looking at the
 * form. Nothing else should use it.
 */
export async function sendTest(targetId: string, by: string): Promise<SendResult> {
  const target = await db.teamsTarget.findUnique({
    where: { id: targetId },
    select: { webhookUrl: true, department: { select: { name: true } } },
  });
  if (!target) return { ok: false, retryable: false, error: "That channel no longer exists." };

  const url = decryptField(target.webhookUrl);
  if (!url) return { ok: false, retryable: false, error: "The stored webhook URL could not be read." };

  const result = await postToWebhook(
    url,
    buildCard({
      kind: "MANUAL",
      title: "Test message from Hackathon Studio",
      body: `${by} connected this channel to the staff portal. Deadline reminders and announcements will arrive here.`,
      eyebrow: target.department?.name ?? "All staff",
      priority: "LOW",
    }),
  );

  await db.teamsTarget.update({
    where: { id: targetId },
    data: result.ok
      ? { lastOkAt: new Date(), lastError: null, sendCount: { increment: 1 } }
      : { lastErrorAt: new Date(), lastError: result.error.slice(0, 500) },
  });

  return result;
}
