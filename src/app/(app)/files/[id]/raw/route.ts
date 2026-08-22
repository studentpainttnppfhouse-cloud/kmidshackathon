import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { can } from "@/lib/policy";
import { requestOrigin } from "@/lib/http";
import { contentDisposition, isInlineType, servedContentType } from "@/lib/uploads";

/**
 * Reading a file back out of the database.
 *
 * Three things this does that a static file server would not:
 *
 *   1. Authorises. The bytes are portal data, so the same `can()` that governs
 *      the asset row governs the download — a link pasted into a group chat is
 *      useless to anyone without an account.
 *   2. Refuses to let the browser render anything but a raster image. Anything
 *      else is `application/octet-stream` + `attachment`, so an uploaded SVG or
 *      HTML file downloads instead of executing script on this origin. See
 *      src/lib/uploads.ts.
 *   3. Streams. Chunks are pulled one at a time, so serving a 20 MB video costs
 *      512 KiB of memory rather than 20 MB.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.redirect(new URL("/login", requestOrigin(request)), 303);
  }

  const { id } = await params;

  const file = await db.fileAsset.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      fileName: true,
      storage: true,
      mimeType: true,
      sizeBytes: true,
      checksum: true,
      deletedAt: true,
      departmentId: true,
      uploadedById: true,
    },
  });

  const missing = NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!file || file.deletedAt || file.storage !== "db") return missing;
  if (!can(viewer, "read", { kind: "file", departmentId: file.departmentId, ownerId: file.uploadedById })) {
    // 404 rather than 403: whether an asset exists is itself information.
    return missing;
  }
  // sizeBytes is written last, so a zero means the upload died halfway.
  if (!file.sizeBytes || file.sizeBytes <= 0) {
    return NextResponse.json({ error: "This upload is incomplete." }, { status: 409 });
  }

  const etag = file.checksum ? `"${file.checksum}"` : null;
  if (etag && request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 }) as NextResponse;
  }

  const chunks = await db.fileChunk.findMany({
    where: { fileId: file.id },
    select: { idx: true },
    orderBy: { idx: "asc" },
  });

  if (chunks.length === 0) {
    return NextResponse.json({ error: "This file has no stored content." }, { status: 409 });
  }

  const order = chunks.map((c) => c.idx);
  let next = 0;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (next >= order.length) {
        controller.close();
        return;
      }

      const idx = order[next];
      next += 1;

      const row = await db.fileChunk.findUnique({
        where: { fileId_idx: { fileId: file.id, idx } },
        select: { bytes: true },
      });

      if (!row) {
        // A gap means the row was purged mid-download. Ending the stream early
        // gives a short file; erroring gives a failed download, which is honest.
        controller.error(new Error("chunk missing"));
        return;
      }

      controller.enqueue(new Uint8Array(row.bytes));
    },
  });

  const inline = isInlineType(file.mimeType);

  const headers = new Headers({
    "content-type": servedContentType(file.mimeType),
    "content-length": String(file.sizeBytes),
    // The uploader's filename, so the download keeps its extension.
    "content-disposition": contentDisposition(file.fileName || file.name, inline),
    "x-content-type-options": "nosniff",
    // Signed-in content: a shared cache holding one of these is a data leak.
    "cache-control": "private, no-store, must-revalidate",
  });
  if (etag) headers.set("etag", etag);

  return new NextResponse(body, { headers }) as NextResponse;
}
