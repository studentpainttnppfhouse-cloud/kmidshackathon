"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, requireViewer, isAdmin, isOwner } from "@/lib/authorize";
import { emailSchema, generateCode } from "@/lib/auth";
import { INVITE_TTL_DAYS, RESET_TTL_HOURS } from "@/lib/constants";
import type { FormState } from "@/lib/actions/auth";
import type { Tier } from "@prisma/client";

const TIERS = [
  "T0_ADVISOR",
  "T1_MEMBER",
  "T2_HEAD",
  "T3_ADMIN",
  "T4_OWNER",
] as const satisfies readonly Tier[];

// ---------------------------------------------------------------------------
// Invites — the only way into the portal. There is no open sign-up page.
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(120).optional().or(z.literal("")),
  roleTitle: z.string().trim().max(80).optional().or(z.literal("")),
  tier: z.enum(TIERS),
  departmentId: z.string().optional().or(z.literal("")),
});

export async function createInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_users", { kind: "user", userId: viewer.id });

  const parsed = inviteSchema.safeParse({
    email: formData.get("email") ?? "",
    name: formData.get("name") ?? "",
    roleTitle: formData.get("roleTitle") ?? "",
    tier: formData.get("tier") ?? "T1_MEMBER",
    departmentId: formData.get("departmentId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Nobody hands out a tier above their own.
  if (d.tier === "T4_OWNER" && !isOwner(viewer)) {
    return { error: "Only an owner can create another owner." };
  }

  const existing = await db.user.findUnique({ where: { email: d.email } });
  if (existing?.passwordHash) {
    return { error: "That person already has an account. Issue a password reset instead." };
  }

  const invite = await db.invite.create({
    data: {
      email: d.email,
      code: generateCode(),
      name: d.name || null,
      roleTitle: d.roleTitle || null,
      tier: d.tier,
      departmentId: d.departmentId || null,
      invitedById: viewer.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await audit(viewer.id, "invite.created", { type: "invite", id: invite.id, detail: d.email });
  revalidatePath("/admin");
  return { ok: `Invite ready. Copy the link from the pending list and send it to ${d.email}.` };
}

export async function revokeInvite(id: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_users", { kind: "user", userId: viewer.id });

  await db.invite.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(viewer.id, "invite.revoked", { type: "invite", id });
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function setUserTier(userId: string, tier: Tier): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_users", { kind: "user", userId });

  if (tier === "T4_OWNER" && !isOwner(viewer)) return;
  if (userId === viewer.id) return; // no self-demotion locking you out

  await db.user.update({ where: { id: userId }, data: { tier } });
  await audit(viewer.id, "user.tier.changed", { type: "user", id: userId, detail: tier });
  revalidatePath("/admin");
}

export async function setUserDepartment(userId: string, departmentId: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_departments", { kind: "user", userId });

  await db.user.update({
    where: { id: userId },
    data: { departmentId: departmentId || null },
  });
  await audit(viewer.id, "user.department.changed", { type: "user", id: userId });
  revalidatePath("/admin");
}

export async function setUserFlag(
  userId: string,
  flag: "isReserve" | "isMentor" | "isAlumni" | "isActive",
  value: boolean,
): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_users", { kind: "user", userId });

  if (userId === viewer.id && flag === "isActive" && !value) return;

  await db.user.update({ where: { id: userId }, data: { [flag]: value } });
  await audit(viewer.id, `user.${flag}`, { type: "user", id: userId, detail: String(value) });
  revalidatePath("/admin");
}

/** Clears a lockout after five failed sign-ins without touching the password. */
export async function unlockUser(userId: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_users", { kind: "user", userId });

  await db.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockedUntil: null },
  });
  await audit(viewer.id, "user.unlocked", { type: "user", id: userId });
  revalidatePath("/admin");
}

/**
 * Admin-issued password reset. Generates a one-time link that T4 hands over in
 * person or on LINE. No email service, so no SMTP credentials in the
 * deployment — a deliberate trade from the build plan.
 */
export async function issuePasswordReset(userId: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_users", { kind: "user", userId });

  await db.passwordReset.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await db.passwordReset.create({
    data: {
      userId,
      code: generateCode(),
      issuedById: viewer.id,
      expiresAt: new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  await audit(viewer.id, "password.reset.issued", { type: "user", id: userId });
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Used both by an owner in the admin panel and by anyone on their own devices. */
export async function revokeSession(sessionId: string): Promise<void> {
  const viewer = await requireViewer();

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });
  if (!session) return;

  const mine = session.userId === viewer.id;
  if (!mine) assertCan(viewer, "manage_sessions", { kind: "user", userId: session.userId });

  await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  await audit(viewer.id, "session.revoked", { type: "session", id: sessionId });

  revalidatePath("/settings");
  revalidatePath("/admin");
}

export async function revokeAllSessionsFor(userId: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_sessions", { kind: "user", userId });

  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit(viewer.id, "session.revoked.all", { type: "user", id: userId });
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

const departmentSchema = z.object({
  name: z.string().trim().min(2, "Name the department.").max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex colour like #EC4899"),
  headUserId: z.string().optional().or(z.literal("")),
});

export async function upsertDepartment(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_departments", { kind: "system" });

  const id = String(formData.get("id") ?? "");
  const parsed = departmentSchema.safeParse({
    name: formData.get("name") ?? "",
    slug: formData.get("slug") ?? "",
    description: formData.get("description") ?? "",
    color: formData.get("color") ?? "#EC4899",
    headUserId: formData.get("headUserId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const data = {
    name: d.name,
    slug: d.slug,
    description: d.description || null,
    color: d.color,
    headUserId: d.headUserId || null,
  };

  if (id) {
    await db.department.update({ where: { id }, data });
    // The head of a department belongs to it.
    if (d.headUserId) {
      await db.user.update({ where: { id: d.headUserId }, data: { departmentId: id } });
    }
    await audit(viewer.id, "department.updated", { type: "department", id });
  } else {
    const created = await db.department.create({ data });
    if (d.headUserId) {
      await db.user.update({
        where: { id: d.headUserId },
        data: { departmentId: created.id },
      });
    }
    await audit(viewer.id, "department.created", { type: "department", id: created.id });
  }

  revalidatePath("/admin");
  revalidatePath("/departments");
  return { ok: "Saved." };
}

// ---------------------------------------------------------------------------
// Export & archive — the two things that make the 2028 handover possible.
// ---------------------------------------------------------------------------

export async function setArchiveMode(on: boolean): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "archive", { kind: "system" });

  await db.setting.upsert({
    where: { key: "archive_mode" },
    create: { key: "archive_mode", value: on ? "1" : "0" },
    update: { value: on ? "1" : "0" },
  });

  await audit(viewer.id, on ? "archive.enabled" : "archive.disabled");
  revalidatePath("/admin");
}

export async function restoreDeleted(
  type: "assignment" | "document" | "file" | "announcement",
  id: string,
): Promise<void> {
  const viewer = await requireViewer();
  if (!isAdmin(viewer)) return;

  const data = { deletedAt: null };
  if (type === "assignment") await db.assignment.update({ where: { id }, data });
  if (type === "document") await db.document.update({ where: { id }, data });
  if (type === "file") await db.fileAsset.update({ where: { id }, data });
  if (type === "announcement") await db.announcement.update({ where: { id }, data });

  await audit(viewer.id, `${type}.restored`, { type, id });
  revalidatePath("/admin");
}
