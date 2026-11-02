import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The signed-in person's own passkeys. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Signed out" }, { status: 401 });
  const passkeys = await db.passkey.findMany({
    where: { userId: viewer.id },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, backedUp: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ passkeys });
}

export async function DELETE(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Signed out" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const removed = await db.passkey.deleteMany({ where: { id, userId: viewer.id } });
  if (removed.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit(viewer.id, "passkey.removed", {
    type: "user",
    id: viewer.id,
    detail: "Removed a passkey from their own account.",
  });
  return NextResponse.json({ ok: true });
}
