import { z } from "zod";

/**
 * Link safety.
 *
 * The portal is an index of links: documents, Drive assets, Canva boards,
 * avatars, form URLs. Every one of them is rendered as an `href` or an `img
 * src`, which makes the URL scheme a security boundary, not a formatting
 * detail.
 *
 * `z.string().url()` is not that boundary. It delegates to the WHATWG URL
 * parser, and `javascript:alert(document.cookie)` is a perfectly valid URL by
 * that definition — as are `data:text/html,...` and `vbscript:`. Storing one
 * and rendering it as `<a href={url}>` is stored XSS: any signed-in person who
 * clicks the link in a card runs the author's script with their own session.
 * React escapes text, not URL schemes.
 *
 * So links are allowlisted, not denylisted: http and https, nothing else.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Control characters and spaces: how a split `java<TAB>script:` sneaks past a naive check. */
const CONTROL_CHARS = /[\u0000-\u0020\u007f]/;

export function isSafeUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return false;
  if (CONTROL_CHARS.test(trimmed)) return false;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;
  // A host-less URL ("http:///x") has nowhere to go.
  return url.hostname.length > 0;
}

const MESSAGE = "Links must start with http:// or https://";

/** A required link. */
export const urlSchema = z
  .string()
  .trim()
  .max(2048, "That link is too long.")
  .refine(isSafeUrl, MESSAGE);

/** An optional link: the empty string is allowed and means "none". */
export const optionalUrlSchema = z
  .string()
  .trim()
  .max(2048, "That link is too long.")
  .refine((value) => value === "" || isSafeUrl(value), MESSAGE)
  .optional()
  .or(z.literal(""));

/**
 * Last line of defence at render time. Anything already in the database from
 * before this check existed — or written by a future code path that forgets the
 * schema — degrades to a dead link rather than an executable one.
 */
export function safeHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  return isSafeUrl(raw) ? raw.trim() : undefined;
}
