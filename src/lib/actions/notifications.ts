"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, can, isAdmin, requireViewer, type Viewer } from "@/lib/authorize";
import { encryptField } from "@/lib/crypto";
import { appOrigin } from "@/lib/request";
import { RULES, rateLimit, retryMessage } from "@/lib/rate-limit";
import { AUTOMATIC_KINDS } from "@/lib/constants";
import { checkWebhookUrl, graphAvailable } from "@/lib/teams/config";
import { enqueue, resolveTargetId, sendTest, type NewJob } from "@/lib/teams/outbox";
import type { FormState } from "@/lib/actions/auth";
import type { NotificationKind, Priority } from "@prisma/client";

/**
 * Everything the notification screen can do.
 *
 * The shape of the permission check is the same in every action and worth
 * stating once: *who may send* is decided per department by `can(... "notify")`,
 * and *who may configure* — webhook URLs, portal-wide rules — is Admin only.
 * A head running Graphics can chase their own designers and cannot touch the
 * Sponsorship channel's URL, which is the whole point of splitting them.
 */

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const satisfies readonly Priority[];

function writeLimit(viewer: Viewer): FormState | null {
  const limit = rateLimit(`write:${viewer.id}`, RULES.write);
  return limit.ok ? null : { error: retryMessage(limit.retryAfter) };
}

// ---------------------------------------------------------------------------
// Sending by hand
// ---------------------------------------------------------------------------

const composeSchema = z.object({
  title: z.string().trim().min(2, "Give the message a subject.").max(150),
  body: z.string().trim().min(2, "Write the message.").max(3000),
  scope: z.enum(["department", "all", "people"]),
  departmentId: z.string().max(40).optional().or(z.literal("")),
  priority: z.enum(PRIORITIES),
  linkPath: z.string().trim().max(200).optional().or(z.literal("")),
});

/**
 * Links are built, never accepted.
 *
 * The composer offers a deep link back into the portal, and the value it posts
 * is a *path* rather than a URL. Anything that is not a single leading-slash
 * path is dropped, so the one clickable button on a card that reaches sixty
 * phones can only ever point at this deployment. A field that took a full URL
 * would be a head-signed phishing link with the portal's name on it.
 */
function portalPath(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (value.length === 0) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (!/^\/[A-Za-z0-9/_-]*$/.test(value)) return null;
  return value;
}

export async function sendNotification(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();

  const limit = rateLimit(`notify:${viewer.id}`, RULES.notify);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  const parsed = composeSchema.safeParse({
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    scope: formData.get("scope") ?? "department",
    departmentId: formData.get("departmentId") ?? "",
    priority: formData.get("priority") ?? "MEDIUM",
    linkPath: formData.get("linkPath") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const recipientIds = formData.getAll("recipientIds").map(String).filter(Boolean).slice(0, 60);

  // "All staff" is the null department, which only an admin may write to.
  const departmentId = d.scope === "all" ? null : d.departmentId || viewer.departmentId;

  if (d.scope === "department" && !departmentId) {
    return { error: "Pick which department this goes to." };
  }

  assertCan(viewer, "notify", { kind: "notification", departmentId: departmentId ?? null });

  if (departmentId) {
    const exists = await db.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!exists) return { error: "That department no longer exists." };
  }

  const path = portalPath(d.linkPath);
  const url = path ? `${await appOrigin()}${path}` : null;

  const jobs: NewJob[] = [];

  if (d.scope === "people") {
    if (recipientIds.length === 0) return { error: "Pick at least one person." };
    if (!graphAvailable()) {
      return {
        error:
          "Sending to one person needs Microsoft Graph, which is not set up on this deployment. Post to the channel instead, or ask an admin to finish the Teams setup.",
      };
    }

    // Every named recipient is re-checked against the sender's reach. The list
    // arrives in a form body, so "these are people I may notify" is a claim.
    const allowed = await db.user.findMany({
      where: {
        id: { in: recipientIds },
        deletedAt: null,
        isActive: true,
        ...(isAdmin(viewer) ? {} : { departmentId: viewer.departmentId ?? "__none__" }),
        teamsIdentity: { is: { optedOut: false } },
      },
      select: { id: true, departmentId: true },
    });

    if (allowed.length === 0) {
      return { error: "None of those people have a Teams account linked yet." };
    }

    const stamp = Date.now();
    for (const person of allowed) {
      jobs.push({
        kind: "MANUAL",
        title: d.title,
        body: d.body,
        url,
        priority: d.priority,
        departmentId: person.departmentId,
        recipientUserId: person.id,
        createdById: viewer.id,
        dedupeKey: `manual:${viewer.id}:${stamp}:${person.id}`,
      });
    }
  } else {
    const targetId = await resolveTargetId(departmentId ?? null);
    if (!targetId) {
      return {
        error: isAdmin(viewer)
          ? "No Teams channel is connected yet. Add one under Teams channels below."
          : "No Teams channel is connected for that department. Ask an admin to add one.",
      };
    }

    jobs.push({
      kind: "MANUAL",
      title: d.title,
      body: d.body,
      url,
      priority: d.priority,
      departmentId: departmentId ?? null,
      targetId,
      createdById: viewer.id,
      dedupeKey: `manual:${viewer.id}:${Date.now()}`,
    });
  }

  const queued = await enqueue(jobs);
  if (queued === 0) return { error: "Nothing was queued. Check the Teams setup below." };

  await audit(viewer.id, "notification.queued", {
    type: "notification",
    detail: `${queued} message(s), ${d.scope}, "${d.title.slice(0, 80)}"`,
  });

  revalidatePath("/notifications");
  return {
    ok:
      queued === 1
        ? "Queued. It goes out on the next dispatch run."
        : `Queued ${queued} messages. They go out on the next dispatch run.`,
  };
}

/** Stops a message that has not gone yet. */
export async function cancelNotification(id: string): Promise<void> {
  const viewer = await requireViewer();

  const job = await db.notificationJob.findUnique({
    where: { id },
    select: { departmentId: true, status: true },
  });
  if (!job || job.status !== "QUEUED") return;

  assertCan(viewer, "notify", { kind: "notification", departmentId: job.departmentId });

  await db.notificationJob.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "CANCELLED" },
  });
  await audit(viewer.id, "notification.cancelled", { type: "notification", id });
  revalidatePath("/notifications");
}

/** Puts a failed message back in the queue, once the cause is fixed. */
export async function retryNotification(id: string): Promise<void> {
  const viewer = await requireViewer();

  const job = await db.notificationJob.findUnique({
    where: { id },
    select: { departmentId: true, status: true },
  });
  if (!job || job.status !== "FAILED") return;

  assertCan(viewer, "notify", { kind: "notification", departmentId: job.departmentId });

  await db.notificationJob.updateMany({
    where: { id, status: "FAILED" },
    // Attempts reset: this is a person saying the cause is fixed, which is new
    // information the backoff curve does not have.
    data: { status: "QUEUED", attempts: 0, notBefore: new Date(), lastError: null },
  });
  await audit(viewer.id, "notification.retried", { type: "notification", id });
  revalidatePath("/notifications");
}

// ---------------------------------------------------------------------------
// Teams channels — Admin only
// ---------------------------------------------------------------------------

const targetSchema = z.object({
  label: z.string().trim().min(2, "Name the channel.").max(80),
  webhookUrl: z.string().trim().min(1, "Paste the webhook URL from Teams."),
  departmentId: z.string().max(40).optional().or(z.literal("")),
});

export async function addTeamsTarget(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_notifications", { kind: "system" });

  const throttled = writeLimit(viewer);
  if (throttled) return throttled;

  const parsed = targetSchema.safeParse({
    label: formData.get("label") ?? "",
    webhookUrl: formData.get("webhookUrl") ?? "",
    departmentId: formData.get("departmentId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const checked = checkWebhookUrl(d.webhookUrl);
  if (!checked.ok) return { error: checked.error };

  const departmentId = d.departmentId || null;
  if (departmentId) {
    const exists = await db.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!exists) return { error: "That department no longer exists." };
  }

  const created = await db.teamsTarget.create({
    data: {
      label: d.label,
      // Encrypted with the same helper that covers phone numbers. A database
      // dump should not hand somebody the ability to post as the portal.
      webhookUrl: encryptField(checked.url) ?? checked.url,
      urlHost: checked.host,
      urlHint: checked.hint,
      departmentId,
      createdById: viewer.id,
    },
  });

  // The URL never appears in the audit detail — only that one was added, and
  // where it points.
  await audit(viewer.id, "teams.target.added", {
    type: "teams_target",
    id: created.id,
    detail: `${d.label} (${checked.host})`,
  });

  revalidatePath("/notifications");
  return { ok: "Channel added. Send a test message to check it works." };
}

export async function toggleTeamsTarget(id: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_notifications", { kind: "system" });

  const target = await db.teamsTarget.findUnique({ where: { id }, select: { isActive: true } });
  if (!target) return;

  await db.teamsTarget.update({ where: { id }, data: { isActive: !target.isActive } });
  await audit(viewer.id, target.isActive ? "teams.target.disabled" : "teams.target.enabled", {
    type: "teams_target",
    id,
  });
  revalidatePath("/notifications");
}

export async function deleteTeamsTarget(id: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_notifications", { kind: "system" });

  // Queued messages pointing at a channel that is about to vanish would fail
  // on the next run with an error that reads like a bug. They are cancelled
  // deliberately instead, so the log says what happened.
  await db.notificationJob.updateMany({
    where: { targetId: id, status: "QUEUED" },
    data: { status: "CANCELLED", lastError: "The Teams channel was removed." },
  });
  await db.notificationRule.updateMany({ where: { targetId: id }, data: { targetId: null } });
  await db.teamsTarget.deleteMany({ where: { id } });

  await audit(viewer.id, "teams.target.removed", { type: "teams_target", id });
  revalidatePath("/notifications");
}

export async function testTeamsTarget(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_notifications", { kind: "system" });

  const limit = rateLimit(`notify:${viewer.id}`, RULES.notify);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  const id = String(formData.get("targetId") ?? "");
  if (!id) return { error: "Pick a channel to test." };

  const result = await sendTest(id, viewer.nickname ?? viewer.name);
  await audit(viewer.id, "teams.target.tested", { type: "teams_target", id });
  revalidatePath("/notifications");

  return result.ok
    ? { ok: "Sent. Check the Teams channel." }
    : { error: result.error };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const ruleSchema = z.object({
  kind: z.enum(AUTOMATIC_KINDS),
  departmentId: z.string().max(40).optional().or(z.literal("")),
  enabled: z.coerce.boolean(),
  leadHours: z.coerce.number().int().min(1).max(336),
  minPriority: z.enum(PRIORITIES),
  pingPeople: z.coerce.boolean(),
});

export async function saveNotificationRule(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const throttled = writeLimit(viewer);
  if (throttled) return throttled;

  const parsed = ruleSchema.safeParse({
    kind: formData.get("kind") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    enabled: formData.get("enabled") === "on",
    leadHours: formData.get("leadHours") ?? 24,
    minPriority: formData.get("minPriority") ?? "LOW",
    pingPeople: formData.get("pingPeople") === "on",
  });
  if (!parsed.success) return { error: "That rule does not look right. Reload and try again." };
  const d = parsed.data;

  const departmentId = d.departmentId || null;

  // A portal-wide rule speaks for every department, so it is Admin work. A
  // department rule needs the same permission as sending to that department.
  if (departmentId === null) {
    assertCan(viewer, "manage_notifications", { kind: "system" });
  } else {
    assertCan(viewer, "notify", { kind: "notification", departmentId });
  }

  // EVENT_SOON is the run sheet, which is one shared thing rather than one per
  // team. Letting a head scope it to their department would create a rule that
  // silently never matches.
  if (d.kind === "EVENT_SOON" && departmentId !== null) {
    return { error: "Run sheet reminders are set for the whole portal, not per department." };
  }

  const settings = {
    enabled: d.enabled,
    leadHours: d.leadHours,
    // A personal ping with no Graph behind it would queue a message that can
    // only ever fail, so the switch is stored as off rather than as a promise
    // the deployment cannot keep.
    pingPeople: d.pingPeople && graphAvailable(),
    minPriority: d.minPriority,
    updatedById: viewer.id,
  };

  // Written as update-then-create rather than `upsert`, for a reason that is
  // pure MySQL: `departmentId` is nullable, and a UNIQUE index treats every
  // NULL as distinct. The index therefore enforces one rule per (kind,
  // department) for a real department and enforces nothing at all for the
  // portal-wide row — which is also why Prisma will not accept a null inside a
  // compound unique lookup. `updateMany` sidesteps both: it writes every row
  // that matches, so even a duplicate created by two admins saving at the same
  // instant ends up holding the same settings.
  const updated = await db.notificationRule.updateMany({
    where: { kind: d.kind as NotificationKind, departmentId },
    data: settings,
  });

  if (updated.count === 0) {
    await db.notificationRule.create({
      data: { kind: d.kind as NotificationKind, departmentId, ...settings },
    });
  }

  await audit(viewer.id, "notification.rule.saved", {
    type: "notification_rule",
    detail: `${d.kind} ${departmentId ?? "all"} ${d.enabled ? "on" : "off"}`,
  });

  revalidatePath("/notifications");
  return { ok: d.enabled ? "Rule is on." : "Rule is off." };
}

// ---------------------------------------------------------------------------
// Linking a portal account to a Teams account
// ---------------------------------------------------------------------------

const identitySchema = z.object({
  userId: z.string().min(1),
  upn: z.string().trim().toLowerCase().email("That is not a valid Microsoft sign-in address.").max(190),
  aadObjectId: z.string().trim().max(64).optional().or(z.literal("")),
});

export async function linkTeamsIdentity(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const throttled = writeLimit(viewer);
  if (throttled) return throttled;

  const parsed = identitySchema.safeParse({
    userId: formData.get("userId") ?? "",
    upn: formData.get("upn") ?? "",
    aadObjectId: formData.get("aadObjectId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const person = await db.user.findUnique({
    where: { id: d.userId },
    select: { id: true, name: true, departmentId: true, deletedAt: true },
  });
  if (!person || person.deletedAt) return { error: "That person is no longer on the team." };

  // Linking somebody's Teams account decides where their pings land, so it
  // needs the same reach as notifying them. Anyone may link their own.
  if (person.id !== viewer.id) {
    if (!can(viewer, "notify", { kind: "notification", departmentId: person.departmentId })) {
      return { error: "You can only link Teams accounts for your own department." };
    }
  }

  // A GUID or nothing. A free-text object id would be posted straight to Graph.
  const aadObjectId =
    d.aadObjectId && /^[0-9a-f-]{36}$/i.test(d.aadObjectId) ? d.aadObjectId : null;
  if (d.aadObjectId && !aadObjectId) {
    return { error: "The Entra object id should be a 36-character GUID, or left blank." };
  }

  await db.teamsIdentity.upsert({
    where: { userId: person.id },
    create: { userId: person.id, upn: d.upn, aadObjectId },
    update: { upn: d.upn, aadObjectId },
  });

  await audit(viewer.id, "teams.identity.linked", { type: "user", id: person.id });
  revalidatePath("/notifications");
  return { ok: `${person.name} is linked to ${d.upn}.` };
}

export async function unlinkTeamsIdentity(userId: string): Promise<void> {
  const viewer = await requireViewer();

  const person = await db.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  if (!person) return;

  if (userId !== viewer.id) {
    assertCan(viewer, "notify", { kind: "notification", departmentId: person.departmentId });
  }

  await db.teamsIdentity.deleteMany({ where: { userId } });
  await audit(viewer.id, "teams.identity.unlinked", { type: "user", id: userId });
  revalidatePath("/notifications");
}
