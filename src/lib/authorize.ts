import "server-only";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { atLeast, can, pageLevel, type Action, type Resource, type Viewer } from "@/lib/policy";
import { PAGE_BY_KEY, type PageKey } from "@/lib/pages";
import type { Tier } from "@prisma/client";

// Re-exported so callers have one import for both the policy and its guards.
export {
  atLeast,
  can,
  canEditPage,
  canSeePage,
  isAdmin,
  isOwner,
  pageLevel,
  type Action,
  type Resource,
  type Viewer,
} from "@/lib/policy";

// ---------------------------------------------------------------------------
// Guards — the only sanctioned entry points for pages and actions.
// ---------------------------------------------------------------------------

/** Require a signed-in viewer, or bounce to the login page. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireTier(tier: Tier): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!atLeast(viewer, tier)) redirect("/dashboard?denied=1");
  return viewer;
}

/**
 * Require a page, at a level.
 *
 * The app shell already turns away anybody the grid has set to NONE, so this is
 * for the second half of the question: a page that is open to a tier at READ
 * still has to stop rendering its buttons and refuse its forms. Pages call it
 * when the difference matters; the ones that only display things do not need to.
 */
export async function requirePageAccess(
  key: PageKey,
  level: "read" | "edit" = "read",
): Promise<Viewer> {
  const viewer = await requireViewer();
  const granted = pageLevel(viewer, key);
  if (granted === "NONE") redirect("/dashboard?denied=page");
  if (level === "edit" && granted !== "EDIT") redirect(`${PAGE_BY_KEY[key].href}?denied=edit`);
  return viewer;
}

export class AuthorizationError extends Error {
  constructor(action: Action, kind: string) {
    super(`Not allowed to ${action} this ${kind}.`);
    this.name = "AuthorizationError";
  }
}

/** Throwing guard for server actions, where a redirect would swallow the error. */
export function assertCan(viewer: Viewer | null, action: Action, resource: Resource): void {
  if (!can(viewer, action, resource)) {
    throw new AuthorizationError(action, resource.kind);
  }
}
