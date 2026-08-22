import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { can } from "@/lib/policy";
import { audit } from "@/lib/audit";
import { requestOrigin, sameOrigin } from "@/lib/http";
import { RULES, rateLimit } from "@/lib/rate-limit";
import {
  chunker,
  formatBytes,
  kindFor,
  maxUploadBytes,
  safeFileName,
  uploadQuotaBytes,
} from "@/lib/uploads";

/**
 * The upload endpoint.
 *
 * A route handler rather than a Server Action, for one reason: Server Actions
 * cap their request body (2 MB here, and raising it raises it for every action
 * in the portal), while a route handler reads the multipart stream itself. So
 * the upload form is a plain `<form method="post" enctype="multipart/form-data">`
 * — which also means it works with JavaScript switched off, and that the file
 * is never held in memory twice.
 *
 * Bytes go into `file_chunks`, 512 KiB at a time, because that is what TiDB
 * will accept in one statement. See src/lib/uploads.ts.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A 20 MB upload over school Wi-Fi is slower than the default.
export const maxDuration = 120;

function back(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/files/new", requestOrigin(request));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  // 303, so the browser follows with GET and a refresh does not re-post.
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.redirect(new URL("/login", requestOrigin(request)), 303);
  }

  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin upload refused." }, { status: 403 });
  }

  const limit = rateLimit(`upload:${viewer.id}`, RULES.upload);
  if (!limit.ok) {
    return back(request, { error: `Too many uploads. Try again in ${limit.retryAfter}s.` });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(request, { error: "That upload did not arrive in one piece. Try again." });
  }

  const upload = form.get("file");
  if (!(upload instanceof File) || upload.size === 0) {
    return back(request, { error: "Choose a file to upload." });
  }

  const departmentId = String(form.get("departmentId") ?? "");
  const department = departmentId
    ? await db.department.findUnique({ where: { id: departmentId }, select: { id: true } })
    : null;
  if (!department) {
    return back(request, { error: "Pick a department to file this under." });
  }

  if (!can(viewer, "create", { kind: "file", departmentId, ownerId: viewer.id })) {
    return back(request, { error: "You cannot add assets to that department." });
  }

  const max = maxUploadBytes();
  if (upload.size > max) {
    return back(request, {
      error: `That file is ${formatBytes(upload.size)}. The limit is ${formatBytes(max)} — put anything larger in Drive and link it instead.`,
    });
  }

  // The quota counts deleted files too: their bytes are still in the database
  // until somebody purges them from the recycle bin.
  const used = await db.fileAsset.aggregate({
    where: { storage: "db" },
    _sum: { sizeBytes: true },
  });
  const quota = uploadQuotaBytes();
  const usedBytes = used._sum.sizeBytes ?? 0;
  if (usedBytes + upload.size > quota) {
    return back(request, {
      error: `The portal's ${formatBytes(quota)} of file storage is full. Empty the recycle bin in the admin panel, or link this one from Drive.`,
    });
  }

  const filename = safeFileName(upload.name);
  const name = String(form.get("name") ?? "").trim().slice(0, 200) || filename;
  const description = String(form.get("description") ?? "").trim().slice(0, 1000);
  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12);

  // The id is minted here rather than by the database, so the chunks can be
  // written under it before the row that owns them exists.
  const fileId = `up${randomBytes(12).toString("hex")}`;
  const mimeType = (upload.type || "application/octet-stream").slice(0, 160);

  const asset = await db.fileAsset.create({
    data: {
      id: fileId,
      name,
      description: description || null,
      externalUrl: null,
      storage: "db",
      fileName: filename,
      mimeType,
      // Filled in once every chunk is written. A row still sitting at 0 is an
      // upload that died halfway, and the download route refuses to serve it.
      sizeBytes: 0,
      kind: kindFor(mimeType, upload.name),
      departmentId,
      uploadedById: viewer.id,
      tags,
      isBrandKit: form.get("isBrandKit") === "on",
    },
    select: { id: true },
  });

  const digest = createHash("sha256");
  let written = 0;
  let index = 0;

  try {
    const reader = upload.stream().getReader();
    // Bytes arrive in whatever sizes the network produced; the chunker regroups
    // them into fixed slices so no single INSERT approaches TiDB's entry limit.
    const slices = chunker();

    const store = async (chunks: Uint8Array[]): Promise<void> => {
      for (const chunk of chunks) {
        digest.update(chunk);
        await db.fileChunk.create({ data: { fileId, idx: index, bytes: Buffer.from(chunk) } });
        index += 1;
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      written += value.byteLength;
      // `upload.size` is the browser's word for it; this is the byte count that
      // actually arrived, and it is what both limits are enforced against — a
      // multipart part can claim one size and send another.
      if (written > max) throw new Error("too large");
      if (usedBytes + written > quota) throw new Error("quota");

      await store(slices.push(value));
    }

    await store(slices.flush());

    // A stream that produced nothing leaves a row pointing at no chunks, which
    // downloads as a zero-byte file. Fail it like any other broken upload.
    if (written === 0) throw new Error("empty");

    await db.fileAsset.update({
      where: { id: asset.id },
      data: { sizeBytes: written, checksum: digest.digest("hex") },
    });
  } catch (error) {
    // A half-written file is worse than no file: it downloads as a corrupt one.
    await db.fileChunk.deleteMany({ where: { fileId } }).catch(() => undefined);
    await db.fileAsset.delete({ where: { id: fileId } }).catch(() => undefined);

    const why = error instanceof Error ? error.message : "";
    return back(request, {
      error:
        why === "too large"
          ? `That file is over the ${formatBytes(max)} limit.`
          : why === "quota"
            ? `The portal's ${formatBytes(quota)} of file storage is full. Empty the recycle bin in the admin panel, or link this one from Drive.`
            : "The upload failed partway through and nothing was saved. Try again.",
    });
  }

  await audit(viewer.id, "file.uploaded", {
    type: "file",
    id: asset.id,
    detail: `${name} (${formatBytes(written)})`,
  });

  const done = new URL("/files", requestOrigin(request));
  done.searchParams.set("saved", asset.id);
  return NextResponse.redirect(done, 303);
}
