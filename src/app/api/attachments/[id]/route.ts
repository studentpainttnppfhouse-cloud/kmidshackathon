import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { resolveParent } from "@/lib/attachment-access";
import { CHUNK_BYTES, canRenderInline } from "@/lib/attachments";
import { safeHref } from "@/lib/url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Handing a stored file back.
 *
 * Three things make this safe to have on the same origin as everybody's
 * session cookie:
 *
 *   1. Authorisation is re-derived from the parent on every request, by the
 *      same function the upload used. An attachment id is not a capability —
 *      knowing one gets you nothing you could not already read.
 *   2. Only an allowlist of types is served as itself. Everything else comes
 *      back as `application/octet-stream` with a download disposition, so an
 *      HTML file somebody uploaded is a file, not a page on this site that can
 *      read the DOM around it. `nosniff` stops the browser second-guessing
 *      that, and a `default-src 'none'; sandbox` policy on the response means
 *      even a type that slipped through the allowlist runs nothing.
 *   3. The body is streamed a chunk at a time. A 10 MB download does not put
 *      10 MB on the heap of a 512 MB instance, and ten at once do not put 100.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getViewer();
  // 404 rather than 401: an unauthenticated request should not be able to tell
  // a real attachment id from a made-up one.
  if (!viewer) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const attachment = await db.attachment.findUnique({
    where: { id },
    select: {
      id: true,
      parentType: true,
      parentId: true,
      name: true,
      mimeType: true,
      size: true,
      storage: true,
      externalUrl: true,
      deletedAt: true,
    },
  });

  if (!attachment || attachment.deletedAt) {
    return new NextResponse("Not found", { status: 404 });
  }

  const parent = await resolveParent(viewer, attachment.parentType, attachment.parentId);
  if (!parent.canRead) return new NextResponse("Not found", { status: 404 });

  // A "link" attachment holds no bytes. It bounces, and only ever to a URL that
  // passes the same http/https allowlist every other link in the portal does.
  if (attachment.storage === "link") {
    const href = safeHref(attachment.externalUrl);
    if (!href) return new NextResponse("Not found", { status: 404 });
    return NextResponse.redirect(href, 302);
  }

  const inline =
    request.nextUrl.searchParams.get("inline") === "1" && canRenderInline(attachment.mimeType);

  const contentType = canRenderInline(attachment.mimeType)
    ? attachment.mimeType
    : "application/octet-stream";

  // RFC 5987: the plain `filename` is the ASCII fallback, `filename*` carries
  // the Thai and the emoji that the plain one cannot.
  const asciiName = attachment.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const disposition = `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`;

  const chunkCount = Math.max(1, Math.ceil(attachment.size / CHUNK_BYTES));

  // Declared before the stream: `pull` can fire synchronously as the stream is
  // constructed, and a temporal-dead-zone read there would fail the download
  // for a reason nothing in the response would explain.
  let sent = 0;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      // `pull` is called once per chunk, so the index lives on the stream
      // rather than in a loop that would read the whole file up front.
      const idx = sent;
      if (idx >= chunkCount) {
        controller.close();
        return;
      }

      const chunk = await db.attachmentChunk.findUnique({
        where: { attachmentId_idx: { attachmentId: attachment.id, idx } },
        select: { bytes: true },
      });

      sent += 1;

      if (!chunk) {
        // A missing chunk is a truncated file, and a truncated file that ends
        // quietly is worse than one that errors: the person gets a corrupt
        // download and no reason to suspect it.
        controller.error(new Error("attachment chunk missing"));
        return;
      }

      controller.enqueue(new Uint8Array(chunk.bytes));
    },
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(attachment.size),
      "content-disposition": disposition,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
      // Private, because the bytes are behind a permission check and a shared
      // cache holding them would hand them to the next person through.
      "cache-control": "private, no-store, must-revalidate",
    },
  });
}
