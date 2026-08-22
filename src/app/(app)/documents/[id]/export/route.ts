import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { can } from "@/lib/authorize";
import { audit } from "@/lib/audit";
import { buildDocx } from "@/lib/export/docx";
import { buildPdf } from "@/lib/export/pdf";
import { RULES, rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Turns a portal-written document into a file.
 *
 * Three formats, one source of truth: the Markdown body. Word for anything that
 * has to be signed or handed to the school, PDF for anything that has to be
 * printed or emailed unchanged, Markdown for anything that has to be edited
 * somewhere else.
 *
 * The route re-checks read permission for itself. A download URL is the easiest
 * thing in a portal to share by accident — it survives in a chat log, a
 * browser history and a screenshot long after the page it came from — so it can
 * never rely on the page having already decided.
 */

const FORMATS = ["docx", "pdf", "md"] as const;
type Format = (typeof FORMATS)[number];

const CONTENT_TYPE: Record<Format, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
};

/**
 * A filename safe to put in a Content-Disposition header.
 *
 * A document title is user input and this header is parsed by the browser: a
 * quote or a newline in it is header injection, and a `/` or `..` is a path the
 * browser may try to interpret. So the name is rebuilt from a character
 * allowlist rather than escaped, and a `filename*` form carries the readable
 * version separately.
 */
function safeFilename(title: string, extension: string): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "document";
  return `${base}.${extension}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Generating a PDF is real CPU work on a free-tier instance.
  const limit = rateLimit(`export:${viewer.id}`, RULES.search);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many exports at once. Wait a moment." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }

  const { id } = await context.params;
  const requested = request.nextUrl.searchParams.get("format") ?? "md";
  const format = (FORMATS as readonly string[]).includes(requested)
    ? (requested as Format)
    : "md";

  const document = await db.document.findUnique({
    where: { id },
    select: {
      title: true,
      body: true,
      source: true,
      description: true,
      status: true,
      updatedAt: true,
      deletedAt: true,
      departmentId: true,
      ownerId: true,
      department: { select: { name: true } },
      owner: { select: { name: true, nickname: true } },
    },
  });

  if (!document || document.deletedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (
    !can(viewer, "read", {
      kind: "document",
      departmentId: document.departmentId,
      ownerId: document.ownerId,
    })
  ) {
    // 404, not 403: a 403 confirms the document exists.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (document.source !== "portal" || !document.body) {
    return NextResponse.json(
      { error: "That document lives in Drive — export it from there." },
      { status: 400 },
    );
  }

  const stamp = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(document.updatedAt);

  const subtitle = `${document.department.name} · ${document.owner.nickname || document.owner.name} · ${document.status.replace(/_/g, " ").toLowerCase()}`;
  const footNote = `Exported from Hackathon Studio — KMIDS Hackathon 2027. Last updated ${stamp}.`;

  let body: Buffer | string;

  if (format === "docx") {
    body = buildDocx({ title: document.title, body: document.body, subtitle, footNote });
  } else if (format === "pdf") {
    body = buildPdf({ title: document.title, body: document.body, subtitle, footNote });
  } else {
    body = [
      `# ${document.title}`,
      "",
      document.description ? `_${document.description}_` : "",
      document.description ? "" : "",
      document.body,
      "",
      "---",
      "",
      `<!-- ${footNote} -->`,
    ]
      .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
      .join("\n");
  }

  const filename = safeFilename(document.title, format);

  await audit(viewer.id, `document.exported.${format}`, { type: "document", id });

  return new NextResponse(body as BodyInit, {
    headers: {
      "content-type": CONTENT_TYPE[format],
      "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      // A document is somebody's work in progress. It does not belong in a
      // proxy cache or a browser's back-forward store.
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
