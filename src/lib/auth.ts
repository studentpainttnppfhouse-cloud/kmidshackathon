import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  ALLOWED_EMAIL_DOMAIN,
  BCRYPT_COST,
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  MIN_PASSWORD_LENGTH,
} from "@/lib/constants";

/**
 * The email domain check exists in three places on purpose: the browser (a
 * courtesy), invite creation, and login. Only the server-side ones count.
 */
export function isAllowedEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("That is not a valid email address.")
  .refine(isAllowedEmail, `Sign-in is limited to @${ALLOWED_EMAIL_DOMAIN} addresses.`);

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(200, "That password is too long.");

/**
 * bcrypt at cost 12 rather than argon2id.
 *
 * The build plan allows either. bcryptjs is pure JavaScript, so a Render build
 * can never fail on a native module that has no prebuilt binary for the
 * runtime image — worth more to a team with one maintainer than argon2's
 * memory hardness is at this threat level. See docs/ARCHITECTURE.md if you
 * want to switch: it is a two-function change plus a rehash-on-login.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** URL-safe one-time code for invites and password resets. */
export function generateCode(): string {
  return randomBytes(24).toString("base64url");
}

export function lockoutUntil(): Date {
  return new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
}

export function isLockedOut(user: { lockedUntil: Date | null }): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
}

export function shouldLock(failedLogins: number): boolean {
  return failedLogins + 1 >= MAX_FAILED_LOGINS;
}

export function minutesRemaining(until: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
}
