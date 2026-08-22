import { safeHref } from "@/lib/url";

/**
 * Where an asset actually is.
 *
 * Two kinds of row live in the `files` table now — a link into Drive, and a
 * file whose bytes are in TiDB — and every page that renders an asset card has
 * to open the right one. Doing that arithmetic in one place is what stops a
 * future page from rendering `href={file.externalUrl}` and producing a dead
 * `#` link for every uploaded file.
 */

export type AssetLike = {
  id: string;
  storage: string;
  externalUrl: string | null;
};

export function isStored(file: { storage: string }): boolean {
  return file.storage === "db";
}

/** The href for an asset, or undefined when there is nothing safe to open. */
export function assetHref(file: AssetLike): string | undefined {
  return isStored(file) ? `/files/${file.id}/raw` : safeHref(file.externalUrl);
}

/**
 * Link attributes for an asset card. A stored file is same-origin and mostly
 * downloads, so it does not want `target="_blank"`; a Drive link does.
 */
export function assetLinkProps(file: AssetLike): {
  href: string;
  target?: "_blank";
  rel?: string;
} {
  const href = assetHref(file);
  if (isStored(file)) return { href: href ?? "#" };
  return { href: href ?? "#", target: "_blank", rel: "noreferrer noopener" };
}
