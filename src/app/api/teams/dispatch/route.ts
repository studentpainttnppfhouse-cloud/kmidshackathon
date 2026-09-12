import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { DISPATCH_BATCH, dispatchSecret } from "@/lib/teams/config";
import { dispatch } from "@/lib/teams/outbox";
import { scanDueAssignments, scanUpcomingEvents } from "@/lib/teams/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The dispatcher. Everything queued gets sent from here.
 *
 * Render's free plan has no background workers and no cron, and Next has no
 * scheduler of its own, so "every fifteen minutes" has to come from outside:
 * a Render Cron Job on a paid plan, a GitHub Actions schedule, or a free
 * pinging service, all of which can do exactly one thing — make an HTTPS
 * request. So the scheduler is an HTTP endpoint, and the whole of its security
 * is the bearer token below.
 *
 * Three things happen per run, in this order:
 *
 *   1. deadlines are scanned and reminders queued
 *   2. the run sheet is scanned, on event days
 *   3. the queue is drained
 *
 * Scanning first means a reminder found this run goes out this run rather than
 * waiting for the next one.
 *
 * Running it twice at once is safe. The scans dedupe on a key that includes the
 * Bangkok date, and the sender claims each job with a conditional update, so the
 * worst case of an overlapping run is wasted work rather than a doubled message.
 */

/**
 * Answers the same way whether the secret is wrong or missing.
 *
 * The comparison is constant-time for the usual reason, and the *response* is
 * identical for a less obvious one: a 401 that distinguishes "no header" from
 * "wrong header" tells somebody probing the endpoint that they have found a
 * real one worth guessing at.
 */
function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  // A query parameter is offered as well, because several free schedulers
  // cannot set a header. It is the weaker form — URLs end up in logs — so it is
  // documented as the fallback rather than the default.
  const query = request.nextUrl.searchParams.get("key") ?? "";
  const supplied = bearer || query;

  if (supplied.length === 0) return false;
  return safeEqual(supplied, secret);
}

async function run(request: NextRequest): Promise<NextResponse> {
  const secret = dispatchSecret();

  if (!secret) {
    return NextResponse.json(
      {
        status: "disabled",
        error:
          "TEAMS_DISPATCH_SECRET is not set (or is under 16 characters), so the dispatcher is switched off.",
        hint: "Generate one with `openssl rand -base64 32` and set it on the service.",
      },
      { status: 503 },
    );
  }

  if (!authorized(request, secret)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const errors: string[] = [];

  // A scan that throws must not stop the queue draining — the messages already
  // in it are the ones somebody is waiting on.
  let queuedFromScans = 0;
  for (const [name, scan] of [
    ["assignments", scanDueAssignments],
    ["events", scanUpcomingEvents],
  ] as const) {
    try {
      queuedFromScans += await scan();
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.name : "unknown"}`);
    }
  }

  const report = await dispatch(DISPATCH_BATCH);

  return NextResponse.json({
    status: errors.length > 0 ? "degraded" : "ok",
    queuedFromScans,
    ...report,
    ...(errors.length > 0 ? { errors } : {}),
    // True when the batch filled up, so a scheduler can call again immediately
    // instead of leaving a backlog until the next tick.
    more: report.claimed >= DISPATCH_BATCH,
    tookMs: Date.now() - startedAt,
    time: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return run(request);
}

/**
 * GET does the same thing, which is not RESTful and is deliberate: half the
 * free schedulers that can hit a URL on a timetable cannot send anything but a
 * GET. The endpoint is guarded by a secret rather than by its method, and a
 * dispatcher nobody can schedule is worth less than a tidy verb.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return run(request);
}
