import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import {
  PORTAL_PAGES,
  TIERS,
  clampAccess,
  defaultAccess,
  isAccessLevel,
  isPageKey,
  type PageKey,
} from "@/lib/pages";
import type { PageAccessLevel, Tier } from "@prisma/client";

/**
 * Reading the page grid, on the server, once per request.
 *
 * The grid is one small table that every single page needs, so it is wrapped in
 * React's `cache()`: the layout asks for it to build the navigation, the page
 * asks for it to decide whether to render, and `getViewer()` asks for it to
 * stamp the viewer — three calls, one query.
 *
 * Everything here reads through `clampAccess`, never around it. A row written
 * last term, before a page gained a floor, is corrected on the way out rather
 * than trusted, which means the bounds in `pages.ts` are the single description
 * of what is possible and the table is only ever a preference.
 */

/** One tier's row: what that tier may do on each page. */
export type PageGrants = Record<PageKey, PageAccessLevel>;

/** The whole grid, as the owner's admin screen draws it. */
export type PageMatrix = Record<PageKey, Record<Tier, PageAccessLevel>>;

type Override = { page: string; tier: Tier; level: PageAccessLevel };

const readOverrides = cache(async (): Promise<Override[]> => {
  try {
    const rows = await db.pageAccess.findMany({
      select: { page: true, tier: true, level: true },
    });
    return rows.filter((row) => isPageKey(row.page) && isAccessLevel(row.level));
  } catch {
    // A portal whose database predates the migration must still open. Falling
    // back to the defaults is the safe direction: it is exactly the behaviour
    // the portal had before the grid existed, rather than an empty grid that
    // would lock everybody out of everything.
    return [];
  }
});

function blankGrants(tier: Tier): PageGrants {
  const grants = {} as PageGrants;
  for (const page of PORTAL_PAGES) {
    grants[page.key] = clampAccess(page.key, tier, defaultAccess(page.key, tier));
  }
  return grants;
}

/** What one tier may do, page by page, defaults and overrides merged. */
export async function grantsForTier(tier: Tier): Promise<PageGrants> {
  const grants = blankGrants(tier);
  for (const row of await readOverrides()) {
    if (row.tier !== tier) continue;
    if (!isPageKey(row.page)) continue;
    grants[row.page] = clampAccess(row.page, tier, row.level);
  }
  return grants;
}

/** The full page-by-tier grid. */
export async function pageMatrix(): Promise<PageMatrix> {
  const matrix = {} as PageMatrix;
  for (const page of PORTAL_PAGES) {
    matrix[page.key] = {} as Record<Tier, PageAccessLevel>;
    for (const tier of TIERS) {
      matrix[page.key][tier] = clampAccess(page.key, tier, defaultAccess(page.key, tier));
    }
  }
  for (const row of await readOverrides()) {
    if (!isPageKey(row.page)) continue;
    matrix[row.page][row.tier] = clampAccess(row.page, row.tier, row.level);
  }
  return matrix;
}

/** One column of the grid, for the small control at the top of a page. */
export async function pageRow(key: PageKey): Promise<Record<Tier, PageAccessLevel>> {
  return (await pageMatrix())[key];
}
