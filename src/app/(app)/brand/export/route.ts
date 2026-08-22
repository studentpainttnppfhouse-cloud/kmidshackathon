import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { audit } from "@/lib/audit";
import { PdfBuilder } from "@/lib/export/pdf";
import { RULES, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The brand kit as a one-file PDF.
 *
 * The point of a brand kit is that somebody outside the portal — a printer, a
 * sponsor's designer, next year's team — can use it. A page behind a login is
 * not that; a PDF somebody can attach to an email is. Every swatch is drawn as
 * a real filled rectangle with its hex printed beside it, so the file is usable
 * as a specification rather than a screenshot.
 */

const CORE = [
  { name: "Primary pink", hex: "#EC4899", note: "Buttons, active states, the ECG line" },
  { name: "Deep pink", hex: "#BE185D", note: "Headings and emphasis" },
  { name: "Pink wash", hex: "#FDF2F8", note: "Page background (light)" },
  { name: "Surface", hex: "#FFFFFF", note: "Cards and sheets" },
  { name: "Body text", hex: "#1F2937", note: "All running text" },
  { name: "Muted", hex: "#64748B", note: "Secondary text" },
  { name: "Success", hex: "#22C55E", note: "Done, approved" },
  { name: "Warning", hex: "#F59E0B", note: "Needs review" },
  { name: "Danger", hex: "#DC2626", note: "Overdue, incidents" },
  { name: "Dark ground", hex: "#17121A", note: "Page background (dark mode)" },
  { name: "Dark surface", hex: "#201A24", note: "Cards in dark mode" },
  { name: "Dark pink", hex: "#F472B6", note: "Brand pink, lifted for dark mode" },
];

export async function GET(): Promise<NextResponse> {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const limit = rateLimit(`export:${viewer.id}`, RULES.search);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many exports at once." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }

  const tokens = await db.brandToken.findMany({
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
  });

  const colors = tokens.filter((t) => t.kind === "color");
  const fonts = tokens.filter((t) => t.kind === "font");

  const pdf = new PdfBuilder();

  pdf.text("Hackathon Studio", { size: 26, font: "Helvetica-Bold", color: "#BE185D", spaceAfter: 2 });
  pdf.text("Brand Kit — KMIDS Hackathon 2027", { size: 12, color: "#64748B", spaceAfter: 8 });
  pdf.rule();

  pdf.text("Core palette", { size: 15, font: "Helvetica-Bold", spaceAfter: 6 });
  pdf.text("Built into the portal's stylesheet. These do not change without a code change.", {
    size: 9.5,
    color: "#64748B",
    spaceAfter: 8,
  });
  for (const color of CORE) pdf.swatch(color.hex, color.name, color.note);

  if (colors.length > 0) {
    pdf.space(10);
    pdf.rule();
    pdf.text("Team palette", { size: 15, font: "Helvetica-Bold", spaceAfter: 6 });

    let currentGroup: string | null = null;
    for (const color of colors) {
      const group = color.groupName ?? "Ungrouped";
      if (group !== currentGroup) {
        currentGroup = group;
        pdf.space(6);
        pdf.text(group, { size: 11, font: "Helvetica-Bold", color: "#64748B", spaceAfter: 4 });
      }
      pdf.swatch(color.value, color.name, color.note ?? "");
    }
  }

  pdf.space(10);
  pdf.rule();
  pdf.text("Typography", { size: 15, font: "Helvetica-Bold", spaceAfter: 6 });
  pdf.text("Inter throughout. Display 34/800, Heading 24/700, Subheading 17/700, Body 15/400, Caption 12/600.", {
    size: 10,
    spaceAfter: 6,
  });

  for (const font of fonts) {
    pdf.text(`${font.name} — ${font.value}${font.note ? ` (${font.note})` : ""}`, {
      size: 10,
      indent: 12,
      spaceAfter: 2,
    });
  }

  pdf.space(10);
  pdf.rule();
  pdf.text("Rules", { size: 15, font: "Helvetica-Bold", spaceAfter: 6 });
  for (const rule of [
    "The ECG line is a single continuous path, stroke width 2.5, round caps.",
    "Pink on white, or white on pink. In dark mode the pink lifts to #F472B6.",
    "Corners 8-16px. Dividers 1px. Nothing is navy.",
    "Animation is decoration and stops under prefers-reduced-motion.",
  ]) {
    pdf.text(`- ${rule}`, { size: 10, indent: 10, spaceAfter: 2 });
  }

  const stamp = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date());

  pdf.space(12);
  pdf.text(`Exported from Hackathon Studio on ${stamp}.`, { size: 8.5, color: "#94A3B8" });

  await audit(viewer.id, "brand.exported");

  return new NextResponse(pdf.build() as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="hackathon-studio-brand-kit.pdf"',
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
