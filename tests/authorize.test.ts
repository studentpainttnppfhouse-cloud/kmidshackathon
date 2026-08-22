/**
 * Permission audit.
 *
 * The build plan calls a missing permission check the highest-likelihood risk
 * in the project, and MySQL gives no row-level-security safety net. So every
 * tier gets tested against every action here, and this file is meant to grow
 * whenever a rule changes.
 *
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { can, atLeast, isAdmin, isOwner, type Action, type Resource, type Viewer } from "../src/lib/policy";
import type { Tier } from "@prisma/client";

const DEPT_A = "dept-a";
const DEPT_B = "dept-b";

function user(tier: Tier, overrides: Partial<Viewer> = {}): Viewer {
  return {
    id: `u-${tier}`,
    email: `${tier}@kmids.ac.th`,
    passwordHash: "x",
    name: tier,
    nickname: null,
    grade: null,
    phone: null,
    lineId: null,
    avatarUrl: null,
    shirtSize: null,
    roleTitle: null,
    tier,
    departmentId: DEPT_A,
    isReserve: false,
    isMentor: false,
    isAlumni: false,
    isActive: true,
    failedLogins: 0,
    lockedUntil: null,
    lastLoginAt: null,
    profileCompletedAt: new Date(),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    department: null,
    ...overrides,
  } as Viewer;
}

const advisor = user("T0_ADVISOR");
const member = user("T1_MEMBER");
const head = user("T2_HEAD");
const admin = user("T3_ADMIN");
const owner = user("T4_OWNER");

/** A task in the viewer's own department, assigned to somebody else. */
const taskInA = (ownerIds: string[] = ["someone-else"]): Resource => ({
  kind: "assignment",
  departmentId: DEPT_A,
  ownerIds,
  createdById: "someone-else",
});

const taskInB: Resource = {
  kind: "assignment",
  departmentId: DEPT_B,
  ownerIds: ["someone-else"],
  createdById: "someone-else",
};

// ---------------------------------------------------------------------------

test("tiers are cumulative", () => {
  assert.equal(atLeast(owner, "T1_MEMBER"), true);
  assert.equal(atLeast(admin, "T2_HEAD"), true);
  assert.equal(atLeast(member, "T2_HEAD"), false);
  assert.equal(atLeast(advisor, "T1_MEMBER"), false);
  assert.equal(isAdmin(head), false);
  assert.equal(isAdmin(admin), true);
  assert.equal(isOwner(admin), false);
  assert.equal(isOwner(owner), true);
});

test("nobody signed out gets anything", () => {
  for (const action of ["read", "create", "update", "delete"] as Action[]) {
    assert.equal(can(null, action, taskInA()), false, `null viewer got ${action}`);
  }
});

test("a suspended or soft-deleted account is inert", () => {
  assert.equal(can(user("T4_OWNER", { isActive: false }), "read", taskInA()), false);
  assert.equal(can(user("T4_OWNER", { deletedAt: new Date() }), "read", taskInA()), false);
});

test("alumni are read-only regardless of the tier they kept", () => {
  const alum = user("T3_ADMIN", { isAlumni: true });
  assert.equal(can(alum, "read", taskInA()), true);
  assert.equal(can(alum, "update", taskInA()), false);
  assert.equal(can(alum, "delete", taskInA()), false);
  assert.equal(can(alum, "manage_users", { kind: "user", userId: "x" }), false);
});

// --- the department boundary ------------------------------------------------

test("a member cannot edit someone else's task, even in their own department", () => {
  assert.equal(can(member, "update", taskInA()), false);
  assert.equal(can(member, "delete", taskInA()), false);
  assert.equal(can(member, "approve", taskInA()), false);
});

test("a member can update a task assigned to them", () => {
  assert.equal(can(member, "update", taskInA([member.id])), true);
});

test("a member cannot approve their own work", () => {
  assert.equal(can(member, "approve", taskInA([member.id])), false);
});

test("a head rules their own department and only their own", () => {
  assert.equal(can(head, "approve", taskInA()), true);
  assert.equal(can(head, "assign", taskInA()), true);
  assert.equal(can(head, "delete", taskInA()), true);

  assert.equal(can(head, "approve", taskInB), false, "head approved another department");
  assert.equal(can(head, "assign", taskInB), false, "head assigned into another department");
  assert.equal(can(head, "delete", taskInB), false, "head deleted another department's work");
  assert.equal(can(head, "create", taskInB), false, "head created in another department");
});

test("a member cannot create work in a department they are not in", () => {
  assert.equal(can(member, "create", taskInB), false);
});

test("admins write across every department", () => {
  assert.equal(can(admin, "update", taskInB), true);
  assert.equal(can(admin, "approve", taskInB), true);
  assert.equal(can(admin, "delete", taskInB), true);
});

// --- advisors (decision D1) -------------------------------------------------

test("advisors read and comment but never write", () => {
  assert.equal(can(advisor, "read", taskInA()), true);
  assert.equal(can(advisor, "comment", { kind: "system" }), true);
  assert.equal(can(advisor, "create", taskInA()), false);
  assert.equal(can(advisor, "update", taskInA()), false);
  assert.equal(can(advisor, "delete", taskInA()), false);
  assert.equal(can(advisor, "assign", taskInA()), false);
});

test("advisors may approve documents and assignments, and nothing else", () => {
  assert.equal(can(advisor, "approve", taskInA()), true);
  assert.equal(
    can(advisor, "approve", { kind: "document", departmentId: DEPT_A, ownerId: "x" }),
    true,
  );
  assert.equal(can(advisor, "approve", { kind: "user", userId: "x" }), false);
});

test("D1: interview scores and performance notes are T3+ only", () => {
  assert.equal(can(advisor, "read", { kind: "private_notes" }), false);
  assert.equal(can(member, "read", { kind: "private_notes" }), false);
  assert.equal(can(head, "read", { kind: "private_notes" }), false);
  assert.equal(can(admin, "read", { kind: "private_notes" }), true);
  assert.equal(can(owner, "view_private_notes", { kind: "private_notes" }), true);
});

// --- owner-only actions -----------------------------------------------------

test("account management, sessions, export and archive are owner-only", () => {
  const ownerOnly: Action[] = ["manage_users", "manage_sessions", "export", "archive"];
  for (const action of ownerOnly) {
    assert.equal(can(owner, action, { kind: "system" }), true, `owner denied ${action}`);
    assert.equal(can(admin, action, { kind: "system" }), false, `admin allowed ${action}`);
    assert.equal(can(head, action, { kind: "system" }), false, `head allowed ${action}`);
    assert.equal(can(member, action, { kind: "system" }), false, `member allowed ${action}`);
    assert.equal(can(advisor, action, { kind: "system" }), false, `advisor allowed ${action}`);
  }
});

test("the audit log is T3 and above", () => {
  assert.equal(can(admin, "view_audit", { kind: "system" }), true);
  assert.equal(can(head, "view_audit", { kind: "system" }), false);
  assert.equal(can(advisor, "view_audit", { kind: "system" }), false);
});

// --- the recycle bin --------------------------------------------------------
//
// Deleting is recoverable for everybody; getting something back is an admin's
// job; destroying it for good is the owner's alone. These three tests are the
// whole promise that a member cannot lose the team's work.

test("restoring from the recycle bin is T3 and above", () => {
  assert.equal(can(owner, "restore", { kind: "system" }), true);
  assert.equal(can(admin, "restore", { kind: "system" }), true);
  assert.equal(can(head, "restore", { kind: "system" }), false);
  assert.equal(can(member, "restore", { kind: "system" }), false);
});

test("purging for good is owner-only — an admin cannot destroy anything", () => {
  assert.equal(can(owner, "purge", { kind: "system" }), true);
  assert.equal(can(admin, "purge", { kind: "system" }), false);
  assert.equal(can(head, "purge", { kind: "system" }), false);
  assert.equal(can(member, "purge", { kind: "system" }), false);
  assert.equal(can(advisor, "purge", { kind: "system" }), false);
});

test("read-only accounts cannot purge or restore either", () => {
  const alumnus = user("T4_OWNER", { isAlumni: true });
  assert.equal(can(alumnus, "purge", { kind: "system" }), false);
  assert.equal(can(alumnus, "restore", { kind: "system" }), false);
});

// --- announcements ----------------------------------------------------------

test("members never broadcast; heads reach their own department only", () => {
  const allStaff: Resource = { kind: "announcement", departmentId: null, authorId: "x" };
  const deptA: Resource = { kind: "announcement", departmentId: DEPT_A, authorId: "x" };
  const deptB: Resource = { kind: "announcement", departmentId: DEPT_B, authorId: "x" };

  assert.equal(can(member, "create", deptA), false);
  assert.equal(can(member, "create", allStaff), false);

  assert.equal(can(head, "create", deptA), true);
  assert.equal(can(head, "create", deptB), false);
  assert.equal(can(head, "create", allStaff), false, "head broadcast to all staff");

  assert.equal(can(admin, "create", allStaff), true);
});

test("an all-staff announcement is readable by everyone", () => {
  const allStaff: Resource = { kind: "announcement", departmentId: null, authorId: "x" };
  for (const u of [advisor, member, head, admin, owner]) {
    assert.equal(can(u, "read", allStaff), true);
  }
});

test("a department announcement stays inside that department", () => {
  const deptB: Resource = { kind: "announcement", departmentId: DEPT_B, authorId: "x" };
  assert.equal(can(member, "read", deptB), false, "member read another department's announcement");
  assert.equal(can(admin, "read", deptB), true);
  assert.equal(can(advisor, "read", deptB), true);
});

// --- incidents --------------------------------------------------------------

test("the incident log is Administration-only", () => {
  assert.equal(can(member, "read", { kind: "incident" }), false);
  assert.equal(can(head, "read", { kind: "incident" }), false);
  assert.equal(can(advisor, "read", { kind: "incident" }), false);
  assert.equal(can(admin, "read", { kind: "incident" }), true);
});

// --- profiles ---------------------------------------------------------------

test("you edit your own profile and nobody else's", () => {
  assert.equal(can(member, "update", { kind: "user", userId: member.id }), true);
  assert.equal(can(member, "update", { kind: "user", userId: "someone-else" }), false);
  assert.equal(can(head, "update", { kind: "user", userId: "someone-else" }), false);
  assert.equal(can(admin, "update", { kind: "user", userId: "someone-else" }), true);
});

// --- documents and files ----------------------------------------------------

test("document approval is a head/admin action", () => {
  const docInA: Resource = { kind: "document", departmentId: DEPT_A, ownerId: member.id };
  assert.equal(can(member, "update", docInA), true, "owner cannot edit own document");
  assert.equal(can(member, "approve", docInA), false);
  assert.equal(can(member, "publish", docInA), false);
  assert.equal(can(head, "approve", docInA), true);
  assert.equal(can(head, "publish", docInA), true);
});

test("a head cannot approve another department's document", () => {
  const docInB: Resource = { kind: "document", departmentId: DEPT_B, ownerId: "x" };
  assert.equal(can(head, "approve", docInB), false);
  assert.equal(can(head, "update", docInB), false);
});

test("comments belong to their author", () => {
  assert.equal(can(member, "delete", { kind: "comment", authorId: member.id }), true);
  assert.equal(can(member, "delete", { kind: "comment", authorId: "other" }), false);
  assert.equal(can(admin, "delete", { kind: "comment", authorId: "other" }), true);
});
