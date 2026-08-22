import "server-only";

/**
 * Throttling for the endpoints an outsider can reach without an account.
 *
 * The portal already locks an *account* after five bad passwords. That stops
 * somebody grinding one person's password; it does nothing about the two
 * attacks that do not target a single account:
 *
 *   1. Spraying one common password across every @kmids.ac.th address. Each
 *      account sees a single failure, so no lockout ever fires.
 *   2. Guessing invite and reset codes, which are not accounts at all and
 *      therefore have no lockout to hit.
 *
 * Worse, per-account lockout is itself a denial of service: anybody who knows a
 * teammate's email can lock them out of their own portal five requests later.
 * Throttling the *source* is what makes that expensive.
 *
 * Storage is process memory. The portal runs as a single Render instance, so
 * one process sees every request and this is accurate. If the service is ever
 * scaled to more than one instance the limit becomes per-instance — generous,
 * but still a bound. That trade is deliberate: a Redis dependency for a
 * six-person staff portal costs more than it protects, and the account lockout
 * underneath it does not depend on this at all.
 */

type Bucket = { hits: number[]; blockedUntil: number };

const buckets = new Map<string, Bucket>();

/** Nothing here is worth remembering for long; keeps the map from growing. */
const SWEEP_EVERY_MS = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const fresh = bucket.hits.some((at) => now - at < 60 * 60 * 1000);
    if (!fresh && bucket.blockedUntil < now) buckets.delete(key);
  }
}

export type RateLimitRule = {
  /** How many attempts are allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** How long a breach locks the key out for. */
  blockMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  /** Whole seconds until the caller may try again. */
  retryAfter: number;
  remaining: number;
};

/**
 * The tuning is deliberately gentle on people and harsh on scripts. A person
 * mistyping a password three times in a row is normal; twenty attempts from one
 * address in five minutes is not.
 */
export const RULES = {
  login: { limit: 12, windowMs: 5 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  code: { limit: 10, windowMs: 10 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  write: { limit: 60, windowMs: 60 * 1000, blockMs: 60 * 1000 },
  search: { limit: 90, windowMs: 60 * 1000, blockMs: 30 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export function rateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { hits: [], blockedUntil: 0 };

  if (bucket.blockedUntil > now) {
    buckets.set(key, bucket);
    return {
      ok: false,
      retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
      remaining: 0,
    };
  }

  bucket.hits = bucket.hits.filter((at) => now - at < rule.windowMs);
  bucket.hits.push(now);

  if (bucket.hits.length > rule.limit) {
    bucket.blockedUntil = now + rule.blockMs;
    bucket.hits = [];
    buckets.set(key, bucket);
    return { ok: false, retryAfter: Math.ceil(rule.blockMs / 1000), remaining: 0 };
  }

  buckets.set(key, bucket);
  return { ok: true, retryAfter: 0, remaining: rule.limit - bucket.hits.length };
}

/** Wipes the record for a key — called after a sign-in actually succeeds. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

export function retryMessage(retryAfter: number): string {
  const minutes = Math.ceil(retryAfter / 60);
  if (minutes <= 1) return "Too many attempts. Wait a minute and try again.";
  return `Too many attempts from this connection. Try again in ${minutes} minutes.`;
}
