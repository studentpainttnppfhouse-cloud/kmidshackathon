import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** P2021 is Prisma's "that table is not there". */
function isMissingSchema(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

/**
 * Render's health check target. Pings the database so a green check actually
 * means the portal can serve a request, not just that Node is alive.
 *
 * It also counts a row, because a reachable database is not the same as a
 * usable one: an empty TiDB cluster answers `SELECT 1` perfectly while every
 * page that touches a table 500s. That gap is what made a deploy look healthy
 * and still fail on /login, so it is reported here instead of being discovered
 * by a person trying to sign in.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        database: "down",
        // Never leak the connection string, which lives in the Prisma error.
        error: error instanceof Error ? error.name : "unknown",
        time: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  let schema: "ready" | "missing" = "ready";

  try {
    await db.user.count();
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
    schema = "missing";
  }

  return NextResponse.json({
    status: schema === "ready" ? "ok" : "degraded",
    database: "up",
    schema,
    // Deliberately a 200: the service is reachable and this is the page that
    // says what to do about it.
    ...(schema === "missing"
      ? { hint: "Migrations have never been applied. Run `npm run db:bootstrap`, or redeploy — the start command runs it." }
      : {}),
    latencyMs: Date.now() - startedAt,
    time: new Date().toISOString(),
  });
}
