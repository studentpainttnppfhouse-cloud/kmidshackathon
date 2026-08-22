/**
 * A small Markdown renderer, written rather than installed.
 *
 * Documents written in the portal are stored as Markdown and shown as HTML.
 * That is an XSS sink by construction — the body is user input and the output
 * is markup — so the renderer is the security control, and the two rules that
 * make it one are:
 *
 *   1. Every character of the input is HTML-escaped *before* any Markdown
 *      syntax is interpreted. Nothing the author types can become a tag,
 *      because `<` stops being `<` in the first pass.
 *   2. Only this file's own fixed strings become tags. There is no raw-HTML
 *      passthrough, no `dangerouslySetInnerHTML` of author content, and links
 *      go through the same http/https allowlist as every other URL in the
 *      portal.
 *
 * The alternative was `marked` + `DOMPurify`: two dependencies, a sanitiser
 * that has to be configured correctly, and a much larger surface than the six
 * constructs a staff document actually uses. This supports headings, bold,
 * italic, inline code, links, bullet and numbered lists, block quotes, fenced
 * code, horizontal rules and paragraphs — and nothing else, deliberately.
 */

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "rule" };

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Splits a document body into blocks. Shared by the HTML renderer, the DOCX
 * writer and the PDF writer, so all three agree on what the document *is*
 * before they disagree about how to draw it.
 */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let quote: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: "list", ordered: listOrdered, items: listItems });
      listItems = [];
    }
  };
  const flushQuote = () => {
    if (quote.length > 0) {
      blocks.push({ type: "quote", text: quote.join(" ").trim() });
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    if (code !== null) {
      if (line.trimEnd().startsWith("```")) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }

    if (line.trimEnd().startsWith("```")) {
      flushAll();
      code = [];
      continue;
    }

    if (line.trim().length === 0) {
      flushAll();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushAll();
      blocks.push({ type: "rule" });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (listItems.length > 0 && listOrdered) flushList();
      listOrdered = false;
      listItems.push(bullet[1].trim());
      continue;
    }

    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      flushQuote();
      if (listItems.length > 0 && !listOrdered) flushList();
      listOrdered = true;
      listItems.push(numbered[1].trim());
      continue;
    }

    const blockQuote = /^\s*>\s?(.*)$/.exec(line);
    if (blockQuote) {
      flushParagraph();
      flushList();
      quote.push(blockQuote[1].trim());
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  if (code !== null) blocks.push({ type: "code", text: code.join("\n") });
  flushAll();

  return blocks;
}

/** Inline spans, as plain text with the markers removed. Used by the exporters. */
export function stripInline(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\(([^)\s]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1");
}

const SAFE_LINK = /^https?:\/\/[^\s"'<>]+$/i;

/**
 * Inline formatting, applied to text that has *already* been escaped.
 *
 * The ordering matters and is the whole point: `escapeHtml` runs first in
 * `renderMarkdown`, so by the time this function sees the string, an author's
 * `<script>` is already the harmless five characters `&lt;script&gt;`. Every
 * `<` this function introduces is one of its own literals.
 */
function renderInline(escaped: string): string {
  return (
    escaped
      // Links: the label may be anything (it is escaped); the href must match
      // the allowlist exactly or the whole thing stays as literal text.
      .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
        const decoded = href.replace(/&amp;/g, "&");
        if (!SAFE_LINK.test(decoded)) return whole;
        return `<a href="${escapeHtml(decoded)}" target="_blank" rel="noreferrer noopener nofollow">${label}</a>`;
      })
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
  );
}

/** Markdown to HTML. The output is safe to inject; the input never is. */
export function renderMarkdown(source: string): string {
  const blocks = parseBlocks(source);
  const out: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        out.push(`<h${block.level}>${renderInline(escapeHtml(block.text))}</h${block.level}>`);
        break;
      case "paragraph":
        out.push(`<p>${renderInline(escapeHtml(block.text))}</p>`);
        break;
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        const items = block.items
          .map((item) => `<li>${renderInline(escapeHtml(item))}</li>`)
          .join("");
        out.push(`<${tag}>${items}</${tag}>`);
        break;
      }
      case "quote":
        out.push(`<blockquote>${renderInline(escapeHtml(block.text))}</blockquote>`);
        break;
      case "code":
        // No inline pass inside a code fence: the content is meant to be shown
        // exactly as typed, and escaping alone already makes that safe.
        out.push(`<pre><code>${escapeHtml(block.text)}</code></pre>`);
        break;
      case "rule":
        out.push("<hr />");
        break;
    }
  }

  return out.join("\n");
}

/** First lines of the body, for a card preview. Never markup. */
export function excerpt(source: string, max = 180): string {
  const text = parseBlocks(source)
    .filter((b) => b.type === "paragraph" || b.type === "heading")
    .map((b) => ("text" in b ? stripInline(b.text) : ""))
    .join(" ")
    .trim();

  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function wordCount(source: string): number {
  const words = stripInline(source).trim().split(/\s+/).filter(Boolean);
  return words.length;
}
