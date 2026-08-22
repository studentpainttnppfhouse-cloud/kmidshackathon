import "server-only";
import { headers } from "next/headers";

/**
 * Who is calling, as far as the proxy will say.
 *
 * Render terminates TLS and forwards the real address in `x-forwarded-for`. The
 * left-most entry is the client; everything after it is the proxy chain. A
 * client can forge the header, but only by prepending to it — Render appends
 * the socket address it actually saw, so the *right-most* entry is the one
 * nobody downstream controls. For rate-limiting we want the value that cannot
 * be rotated at will, so the last hop wins.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last.slice(0, 64);
  }

  return (h.get("x-real-ip") ?? "unknown").slice(0, 64);
}

/** The address shown to a person on their own device list — their own view of it. */
export async function displayIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first ? first.slice(0, 64) : null;
}

export async function userAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent");
}

/**
 * A form that a script filled in.
 *
 * Two signals, both invisible to a person using the portal normally:
 *
 *   - a honeypot field that CSS hides and a human therefore never types into;
 *   - the time between the page rendering and the form coming back. A person
 *     cannot land on a login form and submit it inside a few hundred
 *     milliseconds; a script does it in twenty.
 *
 * Neither is a CAPTCHA and neither is claimed to be. They cost a determined
 * attacker one line of code each. What they do stop is the bulk of automated
 * credential-stuffing traffic, which is not written for this site — and they
 * cost the people who work here nothing, which a CAPTCHA very much does.
 */
export const BOT_FIELD = "company_website";
export const BOT_TIMESTAMP_FIELD = "form_rendered_at";

/**
 * The floor is 700ms rather than something more aggressive.
 *
 * A script posts in tens of milliseconds, so anything above ~200ms already
 * catches it. The reason not to push higher is the person whose password
 * manager fills both fields on page load and who then clicks straight away:
 * they are legitimate, they are fast, and locking them out to catch a bot that
 * is already caught is a bad trade. Erring low costs nothing real.
 */
const MIN_FILL_MS = 700;
const MAX_FORM_AGE_MS = 6 * 60 * 60 * 1000;

export function looksAutomated(formData: FormData): boolean {
  const honeypot = String(formData.get(BOT_FIELD) ?? "").trim();
  if (honeypot.length > 0) return true;

  const rendered = Number(formData.get(BOT_TIMESTAMP_FIELD) ?? 0);
  if (!Number.isFinite(rendered) || rendered <= 0) return false; // no stamp: do not punish

  const age = Date.now() - rendered;
  if (age < MIN_FILL_MS) return true;
  // A stale tab is a person who left the page open, not a bot — but a stamp
  // from the future, or from last week, is a replayed form body.
  if (age > MAX_FORM_AGE_MS || age < -60_000) return true;

  return false;
}
