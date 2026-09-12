import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_TTL_DAYS } from "@/lib/constants";
import { grantsForTier } from "@/lib/page-access";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/cookies";
import type { Viewer } from "@/lib/policy";

export type { Viewer };
// One constant-time compare for the whole codebase; see src/lib/crypto.ts.
export { safeEqual } from "@/lib/crypto";

/**
 * Sessions are opaque bearer tokens, not signed payloads.
 *
 * The browser holds 32 random bytes; the database holds their SHA-256 hash.
 * Validating a request is a hash + index lookup — no application secret is
 * involved anywhere in the path. That is deliberate: it means a redeploy, a
 * new AUTH_SECRET, or a fresh Render instance cannot invalidate a login. The
 * only things that end a session are expiry, an explicit sign-out, and a T4
 * revoking it from the admin panel.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function expiryFromNow(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<void> {
  const token = generateToken();
  const expiresAt = expiryFromNow();

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
}

/**
 * Resolve the current viewer, or null. Renews the database row whenever the
 * session is more than a day into its life, so an active user's login rolls
 * forward indefinitely and never quietly expires mid-event.
 *
 * The cookie's own expiry is slid forward by `middleware.ts`, not here. This
 * runs during render on most requests — a layout, a page — and Next only
 * allows a cookie write inside a Server Action or a Route Handler, so writing
 * one here threw "Cookies can only be modified in a Server Action or Route
 * Handler" for every signed-in person whose session was a day old.
 */
export async function getViewer(): Promise<Viewer | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { department: true } } },
  });

  if (!session || session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  const user = session.user;
  if (!user || !user.isActive || user.deletedAt) return null;

  const dayMs = 24 * 60 * 60 * 1000;
  if (Date.now() - session.lastSeenAt.getTime() > dayMs) {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: expiryFromNow() },
    });
  }

  // The owner's page grid, resolved once here so that every `can()` call
  // downstream stays synchronous. `grantsForTier` is request-cached, so the
  // layout, the page and each server action share the one query.
  const pageGrants = await grantsForTier(user.tier);

  return { ...user, pageGrants } as Viewer;
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  // Deleted with the same path it was written with — a bare delete() only
  // clears a cookie scoped to the current path, which would leave the browser
  // still holding a (now revoked) token on every other page.
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}
