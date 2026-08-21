import "server-only";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { atLeast, can, type Action, type Resource, type Viewer } from "@/lib/policy";
import type { Tier } from "@prisma/client";

// Re-exported so callers have one import for both the policy and its guards.
export {
  atLeast,
  can,
  isAdmin,
  isOwner,
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
