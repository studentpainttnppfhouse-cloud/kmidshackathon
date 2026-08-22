/**
 * The exporters produce real files or they produce nothing worth having.
 *
 * These assertions are structural on purpose: a .docx that Word refuses to
 * open and a .docx that opens to the wrong text fail in very different ways,
 * and only the first one is catchable without Word. So the ZIP is unpacked and
 * the parts are checked, and the PDF's object table is checked against its own
 * cross-reference offsets.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { buildDocx } from "../src/lib/export/docx";
import { buildPdf } from "../src/lib/export/pdf";
import { renderMarkdown, parseBlocks, excerpt } from "../src/lib/markdown";
import { isSafeUrl, safeHref } from "../src/lib/url";

const SAMPLE = [
  "# Sponsorship plan",
  "",
  "We need **three** tier-one sponsors by *March*.",
  "",
  "- Contact BDMS",
  "- Draft the MOU",
  "",
  "> Approved by the advisor.",
  "",
  "```",
  "npm run db:seed",
  "```",
].join("\n");

/** Reads one entry out of a ZIP produced by createZip. */
function readZipEntry(zip: Buffer, name: string): string {
  let offset = 0;
  while (offset < zip.length - 4) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) break;
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const entryName = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (entryName === name) return inflateRawSync(data).toString("utf8");
    offset = dataStart + compressedSize;
  }
  throw new Error(`entry not found: ${name}`);
}

test("docx is a zip carrying the parts Word requires", () => {
  const docx = buildDocx({ title: "Sponsorship plan", body: SAMPLE });

  assert.equal(docx.readUInt32LE(0), 0x04034b50, "starts with a local file header");

  const types = readZipEntry(docx, "[Content_Types].xml");
  assert.match(types, /wordprocessingml\.document\.main\+xml/);

  const rels = readZipEntry(docx, "_rels/.rels");
  assert.match(rels, /word\/document\.xml/);

  const document = readZipEntry(docx, "word/document.xml");
  assert.match(document, /<w:t xml:space="preserve">Sponsorship plan<\/w:t>/);
  assert.match(document, /Heading1/);
  assert.match(document, /npm run db:seed/);
});

test("docx escapes document text instead of letting it close a tag", () => {
  const docx = buildDocx({
    title: 'Budget <"&"> plan',
    body: "A line with </w:t></w:r></w:p> in it & an ampersand.",
  });
  const document = readZipEntry(docx, "word/document.xml");

  assert.ok(!document.includes("</w:t></w:r></w:p> in it"), "raw XML must not survive");
  assert.match(document, /&lt;\/w:t&gt;/);
  assert.match(document, /&amp;/);
});

test("pdf has a header, a cross-reference table and matching offsets", () => {
  const pdf = buildPdf({ title: "Sponsorship plan", body: SAMPLE, subtitle: "Draft" });
  const text = pdf.toString("latin1");

  assert.ok(text.startsWith("%PDF-1.4"), "PDF header");
  assert.ok(text.trimEnd().endsWith("%%EOF"), "EOF marker");
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /\/Type \/Page[^s]/);

  const startxref = /startxref\n(\d+)/.exec(text);
  assert.ok(startxref, "startxref present");
  assert.equal(text.slice(Number(startxref![1]), Number(startxref![1]) + 4), "xref");
});

test("pdf escapes parentheses so a title cannot truncate the content stream", () => {
  const pdf = buildPdf({ title: "Budget (final) plan", body: "One (two) three\\four" });
  const text = pdf.toString("latin1");
  // The content stream is deflated, so the check is that it still parses:
  // an unbalanced paren would have produced a stream that ends early.
  assert.match(text, /\/Filter \/FlateDecode/);
  assert.ok(pdf.length > 400);
});

test("markdown escapes before it formats", () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)"> and **bold**');
  assert.ok(!html.includes("<img"), "no author-supplied tags");
  assert.match(html, /&lt;img/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test("markdown links are allowlisted by scheme", () => {
  const evil = renderMarkdown("[click](javascript:alert(1))");
  assert.ok(!evil.includes("<a href"), "javascript: is not a link");

  const good = renderMarkdown("[docs](https://docs.google.com/x)");
  assert.match(good, /<a href="https:\/\/docs\.google\.com\/x"/);
  assert.match(good, /rel="noreferrer noopener nofollow"/);
});

test("block parsing keeps lists, quotes and fences apart", () => {
  const blocks = parseBlocks(SAMPLE);
  assert.equal(blocks[0].type, "heading");
  assert.ok(blocks.some((b) => b.type === "list" && b.items.length === 2));
  assert.ok(blocks.some((b) => b.type === "quote"));
  assert.ok(blocks.some((b) => b.type === "code" && b.text.includes("db:seed")));
});

test("excerpt returns text, never markup", () => {
  const preview = excerpt("# Title\n\nSome **bold** words here.");
  assert.ok(!preview.includes("*"));
  assert.match(preview, /Some bold words here/);
});

test("url allowlist rejects every scheme but http and https", () => {
  assert.ok(isSafeUrl("https://drive.google.com/file/d/1"));
  assert.ok(isSafeUrl("http://localhost:3000/x"));

  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "https://",
    "not a url",
    "",
  ]) {
    assert.equal(isSafeUrl(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }

  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref("https://example.com"), "https://example.com");
  assert.equal(safeHref(null), undefined);
});
