import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Uploaded profile pictures. Signed-in staff only. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const image = await db.avatarImage.findUnique({ where: { userId: id } });
  if (!image || !/^image\/(png|jpeg|webp)$/.test(image.mime)) {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.mime,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=86400",
    },
  });
}
