import type { InviteLink } from "@prisma/client";

/**
 * Whether a join link still works, and what to say when it does not.
 *
 * Kept out of the server-action module so both sides can import it: the
 * `/join/[code]` page decides what to render with it, and the action that
 * actually creates the account re-decides with the same function at the moment
 * of the write. A page that says "this link is fine" and an action that
 * disagrees is how somebody ends up typing a password into a dead form.
 */

export type JoinLinkStatus = "ok" | "missing" | "revoked" | "expired" | "full";

/** The subset of an InviteLink this decision needs. */
export type JoinLinkGate = Pick<InviteLink, "revokedAt" | "expiresAt" | "maxUses" | "useCount">;

export function joinLinkStatus(link: JoinLinkGate | null): JoinLinkStatus {
  if (!link) return "missing";
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return "expired";
  if (link.maxUses !== null && link.useCount >= link.maxUses) return "full";
  return "ok";
}

/**
 * One message per failure, and none of them says which link it was.
 *
 * "Revoked" and "expired" are separated because they lead to different
 * questions for the person holding the poster; neither confirms anything about
 * a code the reader does not already have.
 */
export const JOIN_LINK_MESSAGE: Record<Exclude<JoinLinkStatus, "ok">, string> = {
  missing: "This join link is not valid. Ask an admin for the current one.",
  revoked: "This join link has been switched off. Ask an admin for the current one.",
  expired: "This join link has expired. Ask an admin for the current one.",
  full: "This join link has been used by everybody it was good for.",
};

export function joinLinkMessage(status: JoinLinkStatus): string {
  return status === "ok" ? "" : JOIN_LINK_MESSAGE[status];
}

/** "18 of 50 used", or "18 used" when the link has no ceiling. */
export function usesLabel(link: Pick<InviteLink, "useCount" | "maxUses">): string {
  return link.maxUses === null
    ? `${link.useCount} used`
    : `${link.useCount} of ${link.maxUses} used`;
}
