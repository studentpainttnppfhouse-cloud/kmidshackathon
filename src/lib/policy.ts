import { TIER_ORDER } from "@/lib/constants";
import type { Department, Tier, User } from "@prisma/client";

/** A signed-in person, as every policy decision sees them. */
export type Viewer = User & { department: Department | null };

/**
 * The one permission module.
 *
 * TiDB has no row-level security, so the database will happily return any row
 * the application asks for. Every read and every write therefore goes through
 * `authorize()` — no page and no route handler decides for itself. Hiding a
 * button is not security, and neither is a `WHERE departmentId = ?` that
 * somebody forgets to write.
 *
 * Tiers are cumulative. T2 can do everything T1 can, inside its department.
 */

export type Action =
  | "read"
  | "comment"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "assign"
  | "publish"
  | "manage_users"
  | "manage_departments"
  | "manage_sessions"
  | "view_audit"
  | "export"
  | "archive"
  | "view_private_notes"
  | "notify"
  | "manage_notifications";

/** Anything with a department and an owner can be checked against a viewer. */
export type Resource =
  | { kind: "department"; departmentId: string }
  | { kind: "assignment"; departmentId: string; ownerIds: string[]; createdById: string }
  | { kind: "document"; departmentId: string; ownerId: string }
  | { kind: "file"; departmentId: string; ownerId: string }
  | { kind: "announcement"; departmentId: string | null; authorId: string }
  | { kind: "comment"; authorId: string }
  | { kind: "user"; userId: string }
  | { kind: "form"; departmentId: string | null; ownerId: string }
  | { kind: "incident" }
  | { kind: "notification"; departmentId: string | null }
  | { kind: "private_notes" }
  | { kind: "system" };

export function atLeast(user: { tier: Tier }, tier: Tier): boolean {
  return TIER_ORDER[user.tier] >= TIER_ORDER[tier];
}

export function isAdmin(user: { tier: Tier }): boolean {
  return atLeast(user, "T3_ADMIN");
}

export function isOwner(user: { tier: Tier }): boolean {
  return user.tier === "T4_OWNER";
}

/** Advisors read broadly but write nothing except comments and approvals. */
function isAdvisor(user: { tier: Tier }): boolean {
  return user.tier === "T0_ADVISOR";
}

function inDepartment(user: Viewer, departmentId: string | null): boolean {
  if (departmentId === null) return true; // portal-wide / General space
  return user.departmentId === departmentId;
}

/** Head of the department the resource lives in. */
function headOf(user: Viewer, departmentId: string | null): boolean {
  return user.tier === "T2_HEAD" && departmentId !== null && user.departmentId === departmentId;
}

export function can(user: Viewer | null, action: Action, resource: Resource): boolean {
  if (!user) return false;
  if (!user.isActive || user.deletedAt) return false;

  // Alumni and un-activated reserve staff are read-only, whatever their tier.
  const readOnly = user.isAlumni || (user.isReserve && !user.isActive);
  if (readOnly && action !== "read") return false;

  // --- Owner-only actions -------------------------------------------------
  if (
    action === "manage_users" ||
    action === "manage_sessions" ||
    action === "archive" ||
    action === "export"
  ) {
    return isOwner(user);
  }

  if (action === "manage_departments" || action === "view_audit") {
    return isAdmin(user);
  }

  // A Teams webhook URL is a credential: whoever holds it can post into a staff
  // channel as the portal, forever, with no further check. Adding, editing and
  // removing one is therefore Admin work even though *using* one is a head's.
  // The same call covers the portal-wide notification rules, which speak for
  // every department at once.
  if (action === "manage_notifications") {
    return isAdmin(user);
  }

  // D1: interview scores and internal performance notes are T3+ only.
  // Advisors do not see them, regardless of their broad read access.
  if (action === "view_private_notes" || resource.kind === "private_notes") {
    return isAdmin(user);
  }

  // --- Reads --------------------------------------------------------------
  if (action === "read") {
    switch (resource.kind) {
      case "incident":
        // Incident log is Admin-only, per the event-day spec.
        return isAdmin(user);
      case "user":
      case "system":
        return true;
      case "notification":
        // The delivery log names who was chased about what, which is a
        // management view rather than a shared one. Heads see their own
        // department and the all-staff channel; admins see everything.
        if (isAdmin(user)) return true;
        if (user.tier !== "T2_HEAD") return false;
        return resource.departmentId === null || user.departmentId === resource.departmentId;
      case "announcement":
        return (
          resource.departmentId === null ||
          isAdvisor(user) ||
          isAdmin(user) ||
          inDepartment(user, resource.departmentId)
        );
      default:
        // Every tier can see across departments read-only. This is the
        // deliberate exception: the whole point of the portal is a shared view.
        return true;
    }
  }

  if (action === "comment") {
    // Everyone signed in may comment, advisors included.
    return true;
  }

  // --- Writes -------------------------------------------------------------
  // Advisors never write anything beyond comments and approvals.
  if (isAdvisor(user)) return action === "approve" && isApprovable(resource);

  if (isAdmin(user)) return true; // T3/T4 write everywhere

  switch (resource.kind) {
    case "assignment": {
      const mine = resource.ownerIds.includes(user.id) || resource.createdById === user.id;
      if (action === "approve" || action === "assign" || action === "delete") {
        return headOf(user, resource.departmentId);
      }
      if (action === "create") return inDepartment(user, resource.departmentId);
      if (action === "update") return mine || headOf(user, resource.departmentId);
      return false;
    }

    case "document":
    case "file": {
      const mine = resource.ownerId === user.id;
      if (action === "approve" || action === "publish") {
        return headOf(user, resource.departmentId);
      }
      if (action === "create") return inDepartment(user, resource.departmentId);
      if (action === "update") return mine || headOf(user, resource.departmentId);
      if (action === "delete") return mine || headOf(user, resource.departmentId);
      return false;
    }

    case "announcement": {
      // Members do not broadcast. Heads announce to their own department.
      if (resource.departmentId === null) return false;
      if (action === "create") return headOf(user, resource.departmentId);
      return resource.authorId === user.id || headOf(user, resource.departmentId);
    }

    case "form": {
      if (action === "create") return headOf(user, resource.departmentId);
      return resource.ownerId === user.id || headOf(user, resource.departmentId);
    }

    case "notification": {
      if (action !== "notify") return false;
      // All-staff goes to everybody's phone, so it stays with Admin — who
      // returned true above and never reach this line. A head speaks for their
      // own department and nobody else's.
      if (resource.departmentId === null) return false;
      return headOf(user, resource.departmentId);
    }

    case "comment":
      return resource.authorId === user.id;

    case "user":
      // Anyone may edit their own profile. Nobody below T3 edits anyone else's.
      return resource.userId === user.id && (action === "update" || action === "create");

    case "department":
      return headOf(user, resource.departmentId) && action === "update";

    default:
      return false;
  }
}

function isApprovable(resource: Resource): boolean {
  return resource.kind === "document" || resource.kind === "assignment";
}
