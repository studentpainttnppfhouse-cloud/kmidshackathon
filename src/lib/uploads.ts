/**
 * Files that live in the database.
 *
 * The portal used to store links only, and said so on the page: Render wipes
 * its disk on every deploy, so a file written to the instance is gone the next
 * time anybody merges anything. That is true of the *disk*. It is not true of
 * TiDB, which is the one thing in this deployment that outlives a deploy — so
 * an upload goes there, and a poster uploaded in October is still downloadable
 * in March.
 *
 * The rules the database imposes, and what this module does about them:
 *
 *   - A single TiDB transaction entry is capped at about 6 MB. One 20 MB
 *     column would therefore fail on insert, so bytes are split into
 *     `CHUNK_BYTES` slices written one statement at a time.
 *   - Reading a whole file into one Buffer costs that much memory on a 512 MB
 *     Render instance, so downloads stream chunk by chunk.
 *   - Storage is finite and shared: `UPLOAD_QUOTA_MB` caps the whole portal,
 *     `MAX_UPLOAD_MB` caps one file.
 *
 * Nothing here touches the database — it is the arithmetic and the naming, so
 * it can be unit-tested without one. The writes live in the upload route.
 */

/** 512 KiB: comfortably inside TiDB's entry limit, few enough rows to be quick. */
export const CHUNK_BYTES = 512 * 1024;

function envMegabytes(name: string, fallback: number, max: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return Math.min(mb, max) * 1024 * 1024;
}

/** The biggest single file the portal accepts. Default 20 MB. */
export function maxUploadBytes(): number {
  return envMegabytes("MAX_UPLOAD_MB", 20, 64);
}

/** The most the portal will hold in total. Default 1 GB. */
export function uploadQuotaBytes(): number {
  return envMegabytes("UPLOAD_QUOTA_MB", 1024, 20 * 1024);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * Content types the browser is allowed to render in this origin.
 *
 * Everything else is served as `application/octet-stream` with
 * `Content-Disposition: attachment`, which is the whole defence against a
 * member uploading `payroll.html` — or an SVG, which is HTML in a trench coat —
 * and handing a colleague a link that runs script on the portal's own origin
 * with their session attached. Raster images cannot execute anything, so they
 * are the only things shown inline.
 *
 * That is also why there is no denylist of "dangerous" extensions: a design
 * team needs to store SVG logos and .ai files, and a download that never
 * renders is safe whatever it contains.
 */
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

export function isInlineType(mime: string | null | undefined): boolean {
  return mime !== null && mime !== undefined && INLINE_TYPES.has(mime.toLowerCase());
}

/** What the browser is told a download is. Never the uploader's word for it. */
export function servedContentType(mime: string | null | undefined): string {
  return isInlineType(mime) ? (mime as string).toLowerCase() : "application/octet-stream";
}

/**
 * The uploader's filename, reduced to something safe to put in a header and on
 * a filesystem: no path separators, no control characters, no leading dots.
 */
export function safeFileName(raw: string | null | undefined): string {
  const stripped = [...(raw ?? "")]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 0x20 || code === 0x7f) return " "; // control characters
      if (ch === "/" || ch === "\\" || ch === '"') return " ";
      return ch;
    })
    .join("");

  const base = stripped
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 120)
    .trim();

  return base.length > 0 ? base : "download";
}

/**
 * A `Content-Disposition` value both halves of the web agree on: an ASCII
 * fallback for old clients, and RFC 5987 UTF-8 for the Thai filenames this
 * portal is full of.
 */
export function contentDisposition(name: string, inline: boolean): string {
  const safe = safeFileName(name);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_") || "download";
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

/** The asset kinds the file form offers, and what a MIME type maps onto. */
export const FILE_KINDS = [
  "link",
  "image",
  "pdf",
  "video",
  "design",
  "font",
  "logo",
  "doc",
] as const;

export type FileKind = (typeof FILE_KINDS)[number];

/** A sensible `kind` for an upload, so nobody has to pick from a dropdown. */
export function kindFor(mime: string | null | undefined, filename: string): FileKind {
  const type = (mime ?? "").toLowerCase();
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (type.startsWith("image/")) return type === "image/svg+xml" ? "design" : "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("font/") || ["ttf", "otf", "woff", "woff2"].includes(ext)) return "font";
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (["ai", "psd", "sketch", "fig", "indd", "afdesign"].includes(ext)) return "design";
  if (["doc", "docx", "odt", "rtf", "txt", "md", "csv", "xlsx", "pptx"].includes(ext)) return "doc";
  return "link";
}

export type Chunker = {
  /** Buffers a network slice and returns whatever full chunks it completed. */
  push(bytes: Uint8Array): Uint8Array[];
  /** The remainder, as one short final chunk. Empty if nothing is left. */
  flush(): Uint8Array[];
};

/**
 * Regroups a stream into fixed-size chunks.
 *
 * Bytes arrive from the network in whatever sizes the network felt like — 16 KB
 * here, 700 KB there — and the database wants them in even slices. Getting this
 * wrong does not throw; it silently stores a file that downloads corrupted, so
 * it lives here rather than inline in the route, and `tests/uploads.test.ts`
 * checks that what comes out concatenates back to exactly what went in.
 */
export function chunker(chunkBytes: number = CHUNK_BYTES): Chunker {
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;

  function take(size: number): Uint8Array {
    const chunk = new Uint8Array(size);
    let filled = 0;

    while (filled < size) {
      const head = pending[0];
      const need = size - filled;

      if (head.length <= need) {
        chunk.set(head, filled);
        filled += head.length;
        pending.shift();
      } else {
        chunk.set(head.subarray(0, need), filled);
        pending[0] = head.subarray(need);
        filled += need;
      }
    }

    pendingBytes -= size;
    return chunk;
  }

  return {
    push(bytes) {
      if (bytes.byteLength > 0) {
        pending.push(bytes);
        pendingBytes += bytes.byteLength;
      }

      const ready: Uint8Array[] = [];
      while (pendingBytes >= chunkBytes) ready.push(take(chunkBytes));
      return ready;
    },

    flush() {
      if (pendingBytes === 0) {
        pending = [];
        return [];
      }
      return [take(pendingBytes)];
    },
  };
}
