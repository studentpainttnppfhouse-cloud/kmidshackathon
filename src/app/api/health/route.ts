import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Render's health check target. Pings the database so a green check actually
 * means the portal can serve a request, not just that Node is alive.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "up",
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    });
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
}
