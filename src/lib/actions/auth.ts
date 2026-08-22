"use server";

import { redirect } from "next/navigation";
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
import { createSession, destroyCurrentSession } from "@/lib/session";
import { safeEqual } from "@/lib/crypto";
import { MAX_FAILED_LOGINS } from "@/lib/constants";
import { RULES, clearRateLimit, rateLimit, retryMessage } from "@/lib/rate-limit";
import { clientIp, displayIp, looksAutomated, userAgent } from "@/lib/request";

export type FormState = { error?: string; ok?: string };

async function requestMeta() {
  return { userAgent: await userAgent(), ip: await displayIp() };
}

/**
 * A bcrypt hash of a password nobody has, compared against when the account
 * does not exist.
 *
 * Without it, a missing account answers in a millisecond and a real account
 * answers in the ~250ms bcrypt takes at cost 12. That difference is a working
 * account-enumeration oracle: an attacker learns exactly which @kmids.ac.th
 * addresses belong to staff, which is the first half of a credential-stuffing
 * run. Burning the same work on a miss removes the signal.
 */
const DUMMY_HASH = "$2a$12$pzB42QwnyAJjW0o91ErmaeGHG6Yz4J5Cq2pGL98MllqEiXh5iVnPm";

async function equalizeTiming(password: string): Promise<void> {
  try {
    await verifyPassword(password, DUMMY_HASH);
  } catch {
    // The comparison is the point, not its result.
  }
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();

  // Throttle the source before touching the database. Account lockout alone
  // cannot see a password spray across many accounts, and is itself a way to
  // lock a colleague out on purpose.
  const limit = rateLimit(`login:${ip}`, RULES.login);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  if (looksAutomated(formData)) {
    // Answer exactly like a wrong password: a bot that learns it was detected
    // is a bot that gets rewritten.
    await equalizeTiming("bot");
    return { error: "That email and password do not match." };
  }

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
    await equalizeTiming(password);
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

  clearRateLimit(`login:${ip}`);

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
  const ip = await clientIp();

  // Invite codes are 24 random bytes, so guessing one is not realistic — but
  // they are also the only door into the portal, and an unthrottled door is
  // worth throttling whatever the odds.
  const limit = rateLimit(`code:${ip}`, RULES.code);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  if (looksAutomated(formData)) {
    return { error: "This invite link is no longer valid. Ask an admin for a new one." };
  }

  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (password !== confirm) return { error: "The two passwords do not match." };

  const pw = passwordSchema.safeParse(password);
  if (!pw.success) return { error: pw.error.issues[0].message };

  if (!name) return { error: "Enter your full name." };
  if (name.length > 120) return { error: "That name is too long." };

  const invite = await db.invite.findUnique({ where: { code } });
  const stale = "This invite link is no longer valid. Ask an admin for a new one.";

  if (!invite || invite.revokedAt || invite.acceptedAt) return { error: stale };
  if (invite.expiresAt.getTime() < Date.now()) {
    return { error: "This invite has expired. Ask an admin for a new one." };
  }
  if (!safeEqual(invite.code, code)) return { error: stale };

  const email = normalizeEmail(invite.email);
  // Re-check the domain here too: an invite row is not a licence to skip it.
  const emailOk = emailSchema.safeParse(email);
  if (!emailOk.success) return { error: "This invite has an invalid email address on it." };

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

  // Claim the invite conditionally. Two browsers posting the same link at once
  // would otherwise both pass the `acceptedAt` check above and both create a
  // session; `updateMany` with the guard in the WHERE makes the database pick
  // one winner.
  const claimed = await db.invite.updateMany({
    where: { id: invite.id, acceptedAt: null, revokedAt: null },
    data: { acceptedAt: new Date() },
  });
  if (claimed.count === 0) return { error: stale };

  clearRateLimit(`code:${ip}`);

  await createSession(user.id, await requestMeta());
  await audit(user.id, "invite.accepted", { type: "user", id: user.id });

  redirect("/welcome");
}

// ---------------------------------------------------------------------------
// Admin-issued password reset. No email service is involved anywhere.
// ---------------------------------------------------------------------------

export async function usePasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();

  const limit = rateLimit(`code:${ip}`, RULES.code);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  if (looksAutomated(formData)) {
    return { error: "This reset link is no longer valid. Ask an admin for a new one." };
  }

  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) return { error: "The two new passwords do not match." };

  const pw = passwordSchema.safeParse(password);
  if (!pw.success) return { error: pw.error.issues[0].message };

  const stale = "This reset link is no longer valid. Ask an admin for a new one.";
  const reset = await db.passwordReset.findUnique({ where: { code } });
  if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
    return { error: stale };
  }
  if (!safeEqual(reset.code, code)) return { error: stale };

  // Burn the code before setting the password, and only proceed if this call
  // is the one that burned it. A reset link that two tabs can spend twice is a
  // reset link an attacker can race.
  const spent = await db.passwordReset.updateMany({
    where: { id: reset.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (spent.count === 0) return { error: stale };

  const passwordHash = await hashPassword(password);

  await db.user.update({
    where: { id: reset.userId },
    data: { passwordHash, failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  // A reset means the old password is untrusted; every existing session for
  // that account goes with it.
  await db.session.updateMany({
    where: { userId: reset.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  clearRateLimit(`code:${ip}`);

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

  // The current-password field makes this a brute-force target too, and the
  // account lockout deliberately does not apply to a signed-in session.
  const limit = rateLimit(`password:${viewer.id}`, RULES.login);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm) return { error: "The two new passwords do not match." };

  const pw = passwordSchema.safeParse(next);
  if (!pw.success) return { error: pw.error.issues[0].message };

  if (!viewer.passwordHash || !(await verifyPassword(current, viewer.passwordHash))) {
    return { error: "Your current password is not right." };
  }

  if (await verifyPassword(next, viewer.passwordHash)) {
    return { error: "That is the password you already have. Pick a different one." };
  }

  await db.user.update({
    where: { id: viewer.id },
    data: { passwordHash: await hashPassword(next) },
  });

  clearRateLimit(`password:${viewer.id}`);
  await audit(viewer.id, "password.changed", { type: "user", id: viewer.id });
  return { ok: "Password changed." };
}
