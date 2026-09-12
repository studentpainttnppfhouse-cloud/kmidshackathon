"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isOwner, requireViewer } from "@/lib/authorize";
import { RULES, rateLimit } from "@/lib/rate-limit";
import {
  ACCESS_LEVEL_LABEL,
  PAGE_BY_KEY,
  TIERS,
  accessBounds,
  clampAccess,
  defaultAccess,
  isAccessLevel,
  isPageKey,
} from "@/lib/pages";
import type { PageAccessLevel, Tier } from "@prisma/client";

/**
 * Setting one cell of the page grid.
 *
 * Owner only, and only the owner — not T3. The grid decides who sees the audit
 * log and the accounts screen, so an admin who could edit it could grant
 * themselves the one thing their tier is deliberately short of, which makes the
 * distinction between T3 and T4 decorative.
 *
 * The value is clamped rather than validated-and-rejected. `accessBounds` knows
 * that nobody below T3 may be let into Admin and that the dashboard may not be
 * hidden from anybody; a request that asks for either gets the nearest legal
 * answer written instead, so a stale form open in a tab cannot produce a row
 * the rest of the code would then have to defend itself against.
 */
export async function setPageAccess(
  page: string,
  tier: Tier,
  level: PageAccessLevel,
): Promise<void> {
  const viewer = await requireViewer();
  if (!isOwner(viewer)) return;
  if (!isPageKey(page) || !isAccessLevel(level)) return;
  if (!TIERS.includes(tier)) return;

  // The owner's own row is fixed at full access and is not stored. Locking
  // yourself out of the portal you administer is not a preference worth
  // honouring, and there is nobody above T4 to undo it.
  const bounds = accessBounds(page, tier);
  if (bounds.min === bounds.max) return;

  if (!rateLimit(`page-access:${viewer.id}`, RULES.write).ok) return;

  const value = clampAccess(page, tier, level);

  if (value === defaultAccess(page, tier)) {
    // Back to the shipped default: delete the row rather than store a copy of
    // it. An empty table is then a portal nobody has customised, which is worth
    // being able to see at a glance.
    await db.pageAccess.deleteMany({ where: { page, tier } });
  } else {
    await db.pageAccess.upsert({
      where: { page_tier: { page, tier } },
      create: { page, tier, level: value, updatedById: viewer.id },
      update: { level: value, updatedById: viewer.id },
    });
  }

  await audit(viewer.id, "page.access.set", {
    type: "page",
    id: page,
    detail: `${tier} → ${ACCESS_LEVEL_LABEL[value]}`,
  });

  // The navigation is built from this grid, so every page in the app has to be
  // redrawn, not just the one that changed.
  revalidatePath("/", "layout");
  revalidatePath(PAGE_BY_KEY[page].href);
  revalidatePath("/admin/access");
}
