"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  emailSchema,
  hashPassword,
  isLockedOut,
  lockoutUntil,
  minutesRemaining,
  normalizeEmail,
  passwordSchema,
  shouldLock,
  verifyPassword,
} from "@/lib/auth";
import { createSession, destroyCurrentSession, safeEqual } from "@/lib/session";
import { MAX_FAILED_LOGINS } from "@/lib/constants";

export type FormState = { error?: string; ok?: string };

async function requestMeta() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const emailRaw = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const parsed = emailSchema.safeParse(emailRaw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const email = parsed.data;

  const user = await db.user.findUnique({ where: { email } });

  // Same message whether the account is missing, has no password yet, or the
  // password is wrong — an attacker learns nothing about who works here.
  const generic = "That email and password do not match.";

  if (!user || !user.passwordHash || user.deletedAt || !user.isActive) {
    return { error: generic };
  }

  if (isLockedOut(user)) {
    return {
      error: `Too many attempts. Try again in ${minutesRemaining(user.lockedUntil!)} minutes, or ask an admin to unlock the account.`,
    };
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    const lock = shouldLock(user.failedLogins);
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: { increment: 1 },
        lockedUntil: lock ? lockoutUntil() : user.lockedUntil,
      },
    });
    await audit(user.id, "login.failed", { type: "user", id: user.id });
    if (lock) {
      return {
        error: `That is ${MAX_FAILED_LOGINS} failed attempts — the account is locked for 15 minutes.`,
      };
    }
    return { error: generic };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await createSession(user.id, await requestMeta());
  await audit(user.id, "login.success", { type: "user", id: user.id });

  redirect(user.profileCompletedAt ? "/dashboard" : "/welcome");
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Accept an invite: this is where a password first gets set.
// ---------------------------------------------------------------------------

export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (password !== confirm) return { error: "The two passwords do not match." };

  const pw = passwordSchema.safeParse(password);
  if (!pw.success) return { error: pw.error.issues[0].message };

  const invite = await db.invite.findUnique({ where: { code } });
  if (!invite || invite.revokedAt || invite.acceptedAt) {
    return { error: "This invite link is no longer valid. Ask an admin for a new one." };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { error: "This invite has expired. Ask an admin for a new one." };
  }
  if (!safeEqual(invite.code, code)) {
    return { error: "This invite link is no longer valid." };
  }

  const email = normalizeEmail(invite.email);
  // Re-check the domain here too: an invite row is not a licence to skip it.
  const emailOk = emailSchema.safeParse(email);
  if (!emailOk.success) return { error: "This invite has an invalid email address on it." };

  if (!name) return { error: "Enter your full name." };

  const passwordHash = await hashPassword(password);

  const existing = await db.user.findUnique({ where: { email } });

  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          name: existing.name || name,
          tier: invite.tier,
          departmentId: invite.departmentId,
          roleTitle: invite.roleTitle ?? existing.roleTitle,
          isActive: true,
          failedLogins: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      })
    : await db.user.create({
        data: {
          email,
          passwordHash,
          name,
          tier: invite.tier,
          departmentId: invite.departmentId,
          roleTitle: invite.roleTitle,
          lastLoginAt: new Date(),
        },
      });

  await db.invite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  await createSession(user.id, await requestMeta());
  await audit(user.id, "invite.accepted", { type: "user", id: user.id });

  redirect("/welcome");
}

// ---------------------------------------------------------------------------
// Admin-issued password reset. No email service is involved anywhere.
// ---------------------------------------------------------------------------

export async function usePasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) return { error: "The two passwords do not match." };

  const pw = passwordSchema.safeParse(password);
  if (!pw.success) return { error: pw.error.issues[0].message };

  const reset = await db.passwordReset.findUnique({ where: { code } });
  if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
    return { error: "This reset link is no longer valid. Ask an admin for a new one." };
  }

  const passwordHash = await hashPassword(password);

  await db.user.update({
    where: { id: reset.userId },
    data: { passwordHash, failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await db.passwordReset.update({
    where: { id: reset.id },
    data: { usedAt: new Date() },
  });

  // A reset means the old password is untrusted; every existing session for
  // that account goes with it.
  await db.session.updateMany({
    where: { userId: reset.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await createSession(reset.userId, await requestMeta());
  await audit(reset.userId, "password.reset.used", { type: "user", id: reset.userId });

  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Change your own password (does not sign you out of this device).
// ---------------------------------------------------------------------------

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const { getViewer } = await import("@/lib/session");
  const viewer = await getViewer();
  if (!viewer) return { error: "You are signed out. Sign in again." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm) return { error: "The two new passwords do not match." };

  const pw = passwordSchema.safeParse(next);
  if (!pw.success) return { error: pw.error.issues[0].message };

  if (!viewer.passwordHash || !(await verifyPassword(current, viewer.passwordHash))) {
    return { error: "Your current password is not right." };
  }

  await db.user.update({
    where: { id: viewer.id },
    data: { passwordHash: await hashPassword(next) },
  });

  await audit(viewer.id, "password.changed", { type: "user", id: viewer.id });
  return { ok: "Password changed." };
}
