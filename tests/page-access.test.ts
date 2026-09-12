/**
 * The page grid.
 *
 * Two things are worth testing here and they pull in opposite directions. One
 * is that the grid actually takes access away — a page set to Hidden has to
 * stop the server action, not just the menu item. The other is that it never
 * hands any out: the whole design rests on the grid being able to narrow the
 * rules in `policy.ts` and never widen them, so a mistake in it is somebody
 * locked out rather than somebody let in.
 *
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { can, pageLevel, canSeePage, type Resource, type Viewer } from "../src/lib/policy";
import {
  PORTAL_PAGES,
  accessBounds,
  clampAccess,
  defaultAccess,
  pageForPath,
  type PageKey,
} from "../src/lib/pages";
import type { PageAccessLevel, Tier } from "@prisma/client";

const DEPT_A = "dept-a";

function user(
  tier: Tier,
  pageGrants: Partial<Record<PageKey, PageAccessLevel>> = {},
  overrides: Partial<Viewer> = {},
): Viewer {
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
    pageGrants,
    ...overrides,
  } as Viewer;
}

const taskInA: Resource = {
  kind: "assignment",
  departmentId: DEPT_A,
  ownerIds: ["u-T1_MEMBER"],
  createdById: "somebody",
};

const announcementInA: Resource = {
  kind: "announcement",
  departmentId: DEPT_A,
  authorId: "u-T2_HEAD",
};

// --- the registry -----------------------------------------------------------

test("a URL resolves to the page it belongs to, longest prefix first", () => {
  assert.equal(pageForPath("/documents")?.key, "documents");
  assert.equal(pageForPath("/documents/abc/edit")?.key, "documents");
  // /admin/audit sits under /admin but is its own page, and has to win.
  assert.equal(pageForPath("/admin")?.key, "admin");
  assert.equal(pageForPath("/admin/audit")?.key, "audit");
  assert.equal(pageForPath("/admin/invite/xyz")?.key, "admin");
  assert.equal(pageForPath("/dashboard/")?.key, "dashboard");
  assert.equal(pageForPath("/login"), null);
});

test("every page key is unique and every href is absolute", () => {
  const keys = new Set(PORTAL_PAGES.map((page) => page.key));
  assert.equal(keys.size, PORTAL_PAGES.length);
  for (const page of PORTAL_PAGES) {
    assert.ok(page.href.startsWith("/"), `${page.key} has a relative href`);
    assert.ok(page.blurb.length > 0, `${page.key} has no blurb`);
  }
});

// --- bounds -----------------------------------------------------------------

test("the owner is pinned at full access on every page", () => {
  for (const page of PORTAL_PAGES) {
    const bounds = accessBounds(page.key, "T4_OWNER");
    assert.equal(bounds.min, "EDIT", `${page.key} lets the owner below full`);
    assert.equal(bounds.max, "EDIT");
    // Even a stored row saying otherwise is corrected on the way out.
    assert.equal(clampAccess(page.key, "T4_OWNER", "NONE"), "EDIT");
  }
});

test("the dashboard, settings and help cannot be hidden from anybody", () => {
  for (const key of ["dashboard", "settings", "help"] as const) {
    for (const tier of ["T0_ADVISOR", "T1_MEMBER", "T2_HEAD", "T3_ADMIN"] as const) {
      assert.equal(clampAccess(key, tier, "NONE"), "READ", `${key} hid from ${tier}`);
    }
  }
});

test("a floor cannot be opened from below", () => {
  // Somebody sets Admin to Full for members. The row is stored as written or
  // not at all; what matters is that reading it back gives Hidden.
  assert.equal(clampAccess("admin", "T1_MEMBER", "EDIT"), "NONE");
  assert.equal(clampAccess("audit", "T2_HEAD", "READ"), "NONE");
  // T3 is at the floor, so it may be let in — that is the point of the floor
  // being T3 rather than T4 on a page the default keeps closed.
  assert.equal(clampAccess("audit", "T3_ADMIN", "READ"), "READ");
});

test("the shipped defaults are the portal as it behaved before the grid", () => {
  assert.equal(defaultAccess("assignments", "T1_MEMBER"), "EDIT");
  assert.equal(defaultAccess("admin", "T2_HEAD"), "NONE");
  assert.equal(defaultAccess("admin", "T3_ADMIN"), "EDIT");
  assert.equal(defaultAccess("audit", "T3_ADMIN"), "NONE");
  assert.equal(defaultAccess("audit", "T4_OWNER"), "EDIT");
  assert.equal(defaultAccess("notifications", "T1_MEMBER"), "NONE");
  assert.equal(defaultAccess("notifications", "T2_HEAD"), "EDIT");
});

// --- narrowing --------------------------------------------------------------

test("Hidden stops the action, not just the menu item", () => {
  const member = user("T1_MEMBER", { assignments: "NONE" });
  assert.equal(canSeePage(member, "assignments"), false);
  assert.equal(can(member, "read", taskInA), false);
  assert.equal(can(member, "update", taskInA), false);
  assert.equal(can(member, "create", taskInA), false);
});

test("Read only opens the page and refuses every write", () => {
  const head = user("T2_HEAD", { announcements: "READ" });
  assert.equal(can(head, "read", announcementInA), true);
  assert.equal(can(head, "create", announcementInA), false);
  assert.equal(can(head, "delete", announcementInA), false);
  assert.equal(can(head, "comment", announcementInA), false);
});

test("Read & reply adds comments and form answers, and nothing else", () => {
  const member = user("T1_MEMBER", { forms: "COMMENT", assignments: "COMMENT" });
  const formInA: Resource = { kind: "form", departmentId: DEPT_A, ownerId: "u-T2_HEAD" };

  assert.equal(can(member, "read", formInA), true);
  // Answering a form goes through "comment", which is what makes a form fillable
  // by a tier that may not touch anything else on the page.
  assert.equal(can(member, "comment", formInA), true);
  assert.equal(can(member, "create", formInA), false);

  assert.equal(can(member, "comment", taskInA), true);
  assert.equal(can(member, "update", taskInA), false);
});

test("an admin cut off from the accounts screen loses the account levers with it", () => {
  const admin = user("T3_ADMIN", { admin: "NONE" });
  assert.equal(can(admin, "manage_users", { kind: "system" }), false);
  assert.equal(can(admin, "manage_sessions", { kind: "system" }), false);
  // Their own department work is untouched — the grid is per page, not per tier.
  assert.equal(can(admin, "update", taskInA), true);
});

// --- and never widening -----------------------------------------------------

test("Full grants nothing the role did not already have", () => {
  // Members do not broadcast. Handing them Full on Announcements changes that
  // not at all, which is the property the whole design rests on.
  const member = user("T1_MEMBER", { announcements: "EDIT" });
  assert.equal(can(member, "create", announcementInA), false);

  // An advisor is read-and-comment by tier. Full on Documents leaves that alone.
  const advisor = user("T0_ADVISOR", { documents: "EDIT" });
  const docInA: Resource = { kind: "document", departmentId: DEPT_A, ownerId: "someone" };
  assert.equal(can(advisor, "update", docInA), false);
  assert.equal(can(advisor, "approve", docInA), true);

  // A member handed Full on Admin is still not an admin.
  const promoted = user("T1_MEMBER", { admin: "EDIT", people: "EDIT" });
  assert.equal(can(promoted, "manage_users", { kind: "system" }), false);
});

test("a viewer with no grants at all behaves exactly like the defaults", () => {
  const plain = user("T2_HEAD");
  for (const page of PORTAL_PAGES) {
    assert.equal(
      pageLevel(plain, page.key),
      clampAccess(page.key, "T2_HEAD", defaultAccess(page.key, "T2_HEAD")),
      `${page.key} drifted from its default`,
    );
  }
});
