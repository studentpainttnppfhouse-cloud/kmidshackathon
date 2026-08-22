import { deflateSync } from "node:zlib";
import { parseBlocks, stripInline, type Block } from "@/lib/markdown";

/**
 * A PDF writer for portal documents and the brand kit.
 *
 * PDF is a container format with an object table and a byte-offset index, and
 * for text on A4 that is genuinely all it is. The alternative was a headless
 * browser (Chromium in a 512MB Render instance: no) or a rendering library that
 * ships its own font binaries (megabytes, for a five-page memo).
 *
 * So this writes the PDF directly, using the base-14 fonts every reader has
 * built in — Helvetica and Courier. No font embedding means no font licences,
 * no binary assets, and no way for a document to fail to open because a glyph
 * table was truncated.
 *
 * The honest limitation, stated once rather than discovered later: base-14
 * fonts are WinAnsi-encoded, so they cover Latin text and not Thai. A document
 * with Thai in it exports correctly to .docx and .md — both of which are
 * Unicode — and the PDF drops the characters it cannot encode rather than
 * producing a corrupt file. The export page says so at the point of choosing.
 */

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type FontName = "Helvetica" | "Helvetica-Bold" | "Helvetica-Oblique" | "Courier";

/**
 * Character widths for the base-14 fonts, in 1/1000 em.
 *
 * A real metrics table is 256 entries per font. Wrapping only needs to be close
 * enough that a line never overruns the margin, so this uses the average widths
 * that Adobe publishes for the common ranges — narrow for `iljt.,'`, wide for
 * `mwMW`, and one figure for everything else. Lines come out slightly short
 * rather than slightly long, which is the safe direction to be wrong in.
 */
function charWidth(char: string, bold: boolean): number {
  if ("iljt.,:;'|! ".includes(char)) return bold ? 320 : 280;
  if ("fr()[]-".includes(char)) return bold ? 400 : 360;
  if ("mwMW@".includes(char)) return bold ? 900 : 850;
  if (char >= "A" && char <= "Z") return bold ? 680 : 640;
  if (char >= "0" && char <= "9") return bold ? 560 : 556;
  return bold ? 580 : 530;
}

function textWidth(text: string, size: number, font: FontName): number {
  if (font === "Courier") return text.length * size * 0.6;
  const bold = font === "Helvetica-Bold";
  let total = 0;
  for (const char of text) total += charWidth(char, bold);
  return (total / 1000) * size;
}

function wrap(text: string, size: number, font: FontName, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, font) <= width || line === "") {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * PDF string escaping, plus the WinAnsi reality check.
 *
 * Backslash and both parentheses end a literal string early — an unescaped `)`
 * in a document title would truncate the page content stream and produce a file
 * that no reader opens. Characters outside WinAnsi are dropped here rather than
 * written as bytes the reader would render as mojibake.
 */
function pdfString(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\\" || char === "(" || char === ")") {
      out += `\\${char}`;
    } else if (code === 0x2019 || code === 0x2018) {
      out += "'";
    } else if (code === 0x201c || code === 0x201d) {
      out += '"';
    } else if (code === 0x2014 || code === 0x2013) {
      out += "-";
    } else if (code === 0x2026) {
      out += "...";
    } else if (code === 0x00b7 || code === 0x2022) {
      out += "\\267";
    } else if (code >= 32 && code <= 126) {
      out += char;
    } else if (code >= 160 && code <= 255) {
      out += `\\${code.toString(8).padStart(3, "0")}`;
    }
    // Anything else — Thai, CJK, emoji — is not representable in WinAnsi and is
    // dropped. See the note at the top of the file.
  }
  return out;
}

type Op = { text: string; size: number; font: FontName; color: string; x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number; color: string };

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

/** Builds pages by laying content out top-down and starting a page when full. */
export class PdfBuilder {
  private pages: { ops: Op[]; rects: Rect[] }[] = [];
  private ops: Op[] = [];
  private rects: Rect[] = [];
  private cursor = PAGE_HEIGHT - MARGIN;

  private newPage(): void {
    this.pages.push({ ops: this.ops, rects: this.rects });
    this.ops = [];
    this.rects = [];
    this.cursor = PAGE_HEIGHT - MARGIN;
  }

  private ensure(height: number): void {
    if (this.cursor - height < MARGIN) this.newPage();
  }

  space(height: number): void {
    this.cursor -= height;
  }

  text(
    content: string,
    options: {
      size?: number;
      font?: FontName;
      color?: string;
      indent?: number;
      leading?: number;
      spaceAfter?: number;
    } = {},
  ): void {
    const size = options.size ?? 10.5;
    const font = options.font ?? "Helvetica";
    const color = options.color ?? "#1F2937";
    const indent = options.indent ?? 0;
    const leading = options.leading ?? size * 1.45;

    const lines = wrap(content, size, font, CONTENT_WIDTH - indent);

    for (const line of lines) {
      this.ensure(leading);
      this.cursor -= leading;
      this.ops.push({ text: line, size, font, color, x: MARGIN + indent, y: this.cursor });
    }

    this.cursor -= options.spaceAfter ?? size * 0.45;
  }

  rule(color = "#F3E3EC"): void {
    this.ensure(12);
    this.cursor -= 8;
    this.rects.push({ x: MARGIN, y: this.cursor, w: CONTENT_WIDTH, h: 0.8, color });
    this.cursor -= 8;
  }

  /** A colour swatch with its label — used by the brand kit export. */
  swatch(hex: string, name: string, note: string): void {
    const height = 34;
    this.ensure(height + 8);
    this.cursor -= height;
    this.rects.push({ x: MARGIN, y: this.cursor, w: 44, h: height, color: hex });
    this.rects.push({ x: MARGIN, y: this.cursor, w: 44, h: 0.6, color: "#E5E7EB" });
    this.ops.push({
      text: pdfSafeLabel(name),
      size: 11,
      font: "Helvetica-Bold",
      color: "#1F2937",
      x: MARGIN + 56,
      y: this.cursor + height - 13,
    });
    this.ops.push({
      text: hex.toUpperCase(),
      size: 9.5,
      font: "Courier",
      color: "#BE185D",
      x: MARGIN + 56,
      y: this.cursor + height - 25,
    });
    if (note) {
      this.ops.push({
        text: pdfSafeLabel(note).slice(0, 60),
        size: 9,
        font: "Helvetica",
        color: "#64748B",
        x: MARGIN + 220,
        y: this.cursor + height - 19,
      });
    }
    this.cursor -= 10;
  }

  build(): Buffer {
    this.pages.push({ ops: this.ops, rects: this.rects });
    const pages = this.pages.filter((p) => p.ops.length > 0 || p.rects.length > 0);
    if (pages.length === 0) pages.push({ ops: [], rects: [] });

    const fontIds: Record<FontName, string> = {
      Helvetica: "F1",
      "Helvetica-Bold": "F2",
      "Helvetica-Oblique": "F3",
      Courier: "F4",
    };

    const objects: string[] = [];
    const streams: (Buffer | null)[] = [];

    const push = (body: string, stream: Buffer | null = null): number => {
      objects.push(body);
      streams.push(stream);
      return objects.length; // 1-based object numbers
    };

    // Object 1 is the catalog, 2 the page tree; content objects follow.
    push("<< /Type /Catalog /Pages 2 0 R >>");
    push(""); // placeholder for the page tree, filled once page ids are known

    const fontObjects = (Object.keys(fontIds) as FontName[]).map((name) =>
      push(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`),
    );

    const resources = `<< /Font << ${(Object.keys(fontIds) as FontName[])
      .map((name, index) => `/${fontIds[name]} ${fontObjects[index]} 0 R`)
      .join(" ")} >> >>`;

    const pageIds: number[] = [];

    for (const page of pages) {
      const parts: string[] = [];

      for (const rect of page.rects) {
        const [r, g, b] = hexToRgb(rect.color);
        parts.push(
          `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${rect.x.toFixed(2)} ${rect.y.toFixed(2)} ${rect.w.toFixed(2)} ${rect.h.toFixed(2)} re f`,
        );
      }

      for (const op of page.ops) {
        const [r, g, b] = hexToRgb(op.color);
        parts.push(
          `BT /${fontIds[op.font]} ${op.size} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${op.x.toFixed(2)} ${op.y.toFixed(2)} Td (${pdfString(op.text)}) Tj ET`,
        );
      }

      const raw = Buffer.from(parts.join("\n"), "latin1");
      const compressed = deflateSync(raw, { level: 9 });
      const contentId = push(
        `<< /Length ${compressed.length} /Filter /FlateDecode >>`,
        compressed,
      );

      pageIds.push(
        push(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources ${resources} /Contents ${contentId} 0 R >>`,
        ),
      );
    }

    objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>`;

    // --- assemble, tracking byte offsets for the cross-reference table -----
    const chunks: Buffer[] = [];
    let offset = 0;
    const offsets: number[] = [];

    const write = (buffer: Buffer) => {
      chunks.push(buffer);
      offset += buffer.length;
    };

    write(Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"));

    objects.forEach((body, index) => {
      offsets[index] = offset;
      const stream = streams[index];
      write(Buffer.from(`${index + 1} 0 obj\n${body}\n`, "latin1"));
      if (stream) {
        write(Buffer.from("stream\n", "latin1"));
        write(stream);
        write(Buffer.from("\nendstream\n", "latin1"));
      }
      write(Buffer.from("endobj\n", "latin1"));
    });

    const xrefOffset = offset;
    const xref = [
      `xref`,
      `0 ${objects.length + 1}`,
      `0000000000 65535 f `,
      ...offsets.map((value) => `${value.toString().padStart(10, "0")} 00000 n `),
    ].join("\n");

    write(Buffer.from(`${xref}\n`, "latin1"));
    write(
      Buffer.from(
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
        "latin1",
      ),
    );

    return Buffer.concat(chunks);
  }
}

function pdfSafeLabel(text: string): string {
  return text;
}

export type PdfDocumentOptions = {
  title: string;
  body: string;
  subtitle?: string;
  footNote?: string;
};

export function buildPdf({ title, body, subtitle, footNote }: PdfDocumentOptions): Buffer {
  const pdf = new PdfBuilder();

  pdf.text(title, { size: 24, font: "Helvetica-Bold", color: "#BE185D", spaceAfter: 4 });
  if (subtitle) {
    pdf.text(subtitle, { size: 9.5, color: "#94A3B8", spaceAfter: 6 });
  }
  pdf.rule();

  for (const block of parseBlocks(body)) {
    renderBlock(pdf, block);
  }

  if (footNote) {
    pdf.rule();
    pdf.text(footNote, { size: 8.5, color: "#94A3B8" });
  }

  return pdf.build();
}

function renderBlock(pdf: PdfBuilder, block: Block): void {
  switch (block.type) {
    case "heading": {
      const sizes = { 1: 17, 2: 14, 3: 12 } as const;
      pdf.space(6);
      pdf.text(stripInline(block.text), {
        size: sizes[block.level],
        font: "Helvetica-Bold",
        color: block.level === 1 ? "#BE185D" : "#1F2937",
        spaceAfter: 4,
      });
      break;
    }
    case "paragraph":
      pdf.text(stripInline(block.text), { size: 10.5, spaceAfter: 6 });
      break;
    case "quote":
      pdf.text(stripInline(block.text), {
        size: 10.5,
        font: "Helvetica-Oblique",
        color: "#64748B",
        indent: 18,
        spaceAfter: 6,
      });
      break;
    case "code":
      for (const line of block.text.split("\n")) {
        pdf.text(line || " ", {
          size: 9,
          font: "Courier",
          color: "#374151",
          indent: 14,
          leading: 12,
          spaceAfter: 0,
        });
      }
      pdf.space(6);
      break;
    case "list":
      block.items.forEach((item, index) => {
        pdf.text(`${block.ordered ? `${index + 1}.` : "·"}  ${stripInline(item)}`, {
          size: 10.5,
          indent: 14,
          spaceAfter: 2,
        });
      });
      pdf.space(4);
      break;
    case "rule":
      pdf.rule();
      break;
  }
}
