import { SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/constants";

/**
 * One definition of the session cookie, shared by every path that writes it.
 *
 * This file deliberately imports nothing but constants: `middleware.ts` runs on
 * the edge runtime and slides the cookie forward there, so it cannot pull in
 * `session.ts` (server-only, Prisma) to get these flags.
 *
 * `secure` is conditional rather than always-on because a local checkout runs
 * on http://localhost, where a Secure cookie is simply never sent and nobody
 * can sign in. In production `middleware.ts` refuses plain HTTP outright, so
 * the conditional can never resolve to false on a real request.
 *
 * `sameSite: "lax"` and not "strict": strict would drop the cookie on the
 * first navigation in from a LINE message, so a person following an invite
 * link would land on the sign-in page while already signed in. Lax still
 * blocks the cross-site POST that CSRF needs, and Server Actions add their own
 * Origin check on top.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // A persistent cookie, not a session cookie — closing the browser, or the
    // phone going to sleep for a month, must not require signing in again.
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

export { SESSION_COOKIE };
