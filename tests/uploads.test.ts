/**
 * Files in the database.
 *
 * Two things here are security boundaries rather than formatting details: what
 * content type an uploaded file is served as, and what its name is allowed to
 * put in a header. The rest is arithmetic that decides whether a 20 MB poster
 * arrives intact.
 *
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHUNK_BYTES,
  chunker,
  contentDisposition,
  formatBytes,
  isInlineType,
  kindFor,
  maxUploadBytes,
  safeFileName,
  servedContentType,
  uploadQuotaBytes,
} from "../src/lib/uploads";

// --- chunking ---------------------------------------------------------------

test("chunks stay inside TiDB's per-entry limit", () => {
  // TiDB rejects a transaction entry over roughly 6 MB; the margin is the point.
  assert.ok(CHUNK_BYTES < 6 * 1024 * 1024);
});

// --- regrouping a stream ----------------------------------------------------
//
// This is the code that decides whether an uploaded file downloads intact. It
// fails silently when it is wrong — a corrupt file, not an error — so the tests
// check the only property that matters: what goes in comes back out, in order.

/** Feeds `sizes` worth of a known byte pattern through the chunker. */
function through(sizes: number[], chunkBytes: number): Uint8Array[] {
  const slices = chunker(chunkBytes);
  const out: Uint8Array[] = [];
  let next = 0;

  for (const size of sizes) {
    const piece = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) piece[i] = (next + i) % 251;
    next += size;
    out.push(...slices.push(piece));
  }

  out.push(...slices.flush());
  return out;
}

function expected(total: number): Uint8Array {
  const all = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) all[i] = i % 251;
  return all;
}

function joined(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const all = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return all;
}

test("network slices are regrouped into even chunks without losing a byte", () => {
  const sizes = [10, 1, 300, 64, 999, 7, 120];
  const total = sizes.reduce((a, b) => a + b, 0);
  const chunks = through(sizes, 128);

  assert.deepEqual(joined(chunks), expected(total), "the file must round-trip exactly");

  for (const chunk of chunks.slice(0, -1)) {
    assert.equal(chunk.length, 128, "every chunk but the last is full");
  }
  assert.ok(chunks.at(-1)!.length <= 128);
});

test("one slice larger than several chunks is split, not stored whole", () => {
  const chunks = through([1000], 128);

  assert.equal(chunks.length, 8, "1000 bytes at 128 is seven full chunks and a short one");
  assert.deepEqual(joined(chunks), expected(1000));
});

test("a slice that lands exactly on the boundary leaves nothing to flush", () => {
  const slices = chunker(128);
  const ready = slices.push(new Uint8Array(256));

  assert.equal(ready.length, 2);
  assert.deepEqual(slices.flush(), []);
});

test("a stream of nothing produces no chunks at all", () => {
  const slices = chunker(128);
  assert.deepEqual(slices.push(new Uint8Array(0)), []);
  assert.deepEqual(slices.flush(), []);
});

// --- what the browser is told -----------------------------------------------

test("only raster images are served inline", () => {
  for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
    assert.equal(isInlineType(type), true, `${type} should render inline`);
  }

  // An SVG is a document that can carry script, so it downloads instead.
  for (const type of ["image/svg+xml", "text/html", "application/pdf", "application/xml"]) {
    assert.equal(isInlineType(type), false, `${type} must not render in this origin`);
    assert.equal(servedContentType(type), "application/octet-stream");
  }
});

test("an unknown or missing type is never echoed back to the browser", () => {
  assert.equal(servedContentType(null), "application/octet-stream");
  assert.equal(servedContentType("text/html; charset=utf-8"), "application/octet-stream");
  assert.equal(servedContentType("IMAGE/PNG"), "image/png");
});

// --- filenames --------------------------------------------------------------

test("a filename cannot escape its directory or break the header", () => {
  assert.equal(safeFileName("../../etc/passwd"), "etc passwd");
  // A quote would end the header's quoted-string early, so it becomes a space.
  assert.equal(safeFileName('poster".jpg'), "poster .jpg");
  assert.equal(safeFileName("a\nb.png"), "a b.png");
  assert.equal(safeFileName("...."), "download");
  assert.equal(safeFileName(""), "download");
  assert.equal(safeFileName(null), "download");
});

test("a long filename is truncated rather than refused", () => {
  const name = `${"x".repeat(400)}.png`;
  assert.ok(safeFileName(name).length <= 120);
});

test("content-disposition carries both an ASCII name and the real one", () => {
  const header = contentDisposition("โปสเตอร์.pdf", false);

  assert.ok(header.startsWith("attachment; "));
  assert.match(header, /filename="[\x20-\x7e]*"/, "the fallback must be plain ASCII");
  assert.ok(header.includes("filename*=UTF-8''"), "the real name must survive as RFC 5987");
  assert.ok(!header.includes("\n"), "a header can never contain a newline");
});

test("an inline image says inline", () => {
  assert.ok(contentDisposition("logo.png", true).startsWith("inline; "));
});

// --- limits and labels ------------------------------------------------------

test("the size limits are real numbers with sane defaults", () => {
  assert.ok(maxUploadBytes() > 0);
  assert.ok(uploadQuotaBytes() >= maxUploadBytes(), "one file cannot exceed the whole quota");
});

test("sizes read the way a person would say them", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatBytes(20 * 1024 * 1024), "20 MB");
});

test("an upload's kind is guessed from its type, then its extension", () => {
  assert.equal(kindFor("image/png", "logo.png"), "image");
  assert.equal(kindFor("image/svg+xml", "logo.svg"), "design");
  assert.equal(kindFor("application/pdf", "programme.pdf"), "pdf");
  assert.equal(kindFor("video/mp4", "aftermovie.mp4"), "video");
  assert.equal(kindFor("application/octet-stream", "brand.ai"), "design");
  assert.equal(kindFor("application/octet-stream", "budget.xlsx"), "doc");
  assert.equal(kindFor(null, "whatever.bin"), "link");
});
