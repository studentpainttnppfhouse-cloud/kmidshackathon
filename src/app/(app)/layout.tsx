import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { can, canSeePage, isAdmin, isOwner } from "@/lib/authorize";
import { signOut } from "@/lib/actions/auth";
import { SETTING_KEYS, getSettings } from "@/lib/settings";
import { pageForPath } from "@/lib/pages";
import { pageMatrix } from "@/lib/page-access";
import { safeHref } from "@/lib/url";
import { AppNav, type NavItem } from "@/components/nav";
import { PageAccessBar } from "@/components/page-access-bar";
import { ContactButton } from "@/components/chrome";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profileCompletedAt) redirect("/welcome");

  // The page grid, enforced once for the whole app.
  //
  // The middleware forwards the path because a layout has no other way to learn
  // it, and this is the right place for the check: it covers every route
  // underneath — /documents/abc/edit as much as /documents — so hiding a page
  // hides everything inside it without thirty separate guards to keep in step.
  // The nav filter below is cosmetic; this is the part that means anything.
  const here = pageForPath((await headers()).get("x-pathname") ?? "");
  if (here && !canSeePage(viewer, here.key)) redirect("/dashboard?denied=page");

  const [myOpenTasks, unreadAnnouncements, settings] = await Promise.all([
    db.assignment.count({
      where: {
        deletedAt: null,
        status: { notIn: ["DONE", "APPROVED"] },
        assignees: { some: { userId: viewer.id } },
      },
    }),
    db.announcement.count({
      where: {
        deletedAt: null,
        OR: [{ scope: "all" }, { departmentId: viewer.departmentId ?? "__none__" }],
        reads: { none: { userId: viewer.id } },
      },
    }),
    getSettings([SETTING_KEYS.eventPanel, SETTING_KEYS.contactLine]),
  ]);

  const sees = (key: Parameters<typeof canSeePage>[1]) => canSeePage(viewer, key);

  const items: NavItem[] = (
    [
      { key: "dashboard", href: "/dashboard", label: "Dashboard", badge: undefined },
      {
        key: "assignments",
        href: "/assignments",
        label: "Assignments",
        badge: myOpenTasks || undefined,
      },
      { key: "departments", href: "/departments", label: "Departments", badge: undefined },
      { key: "people", href: "/people", label: "People", badge: undefined },
      { key: "documents", href: "/documents", label: "Documents", badge: undefined },
      { key: "files", href: "/files", label: "Files & Assets", badge: undefined },
      { key: "brand", href: "/brand", label: "Brand Kit", badge: undefined },
      { key: "forms", href: "/forms", label: "Forms", badge: undefined },
      {
        key: "announcements",
        href: "/announcements",
        label: "Announcements",
        badge: unreadAnnouncements || undefined,
      },
    ] as const
  )
    .filter((item) => sees(item.key))
    .map(({ href, label, badge }) => ({ href, label, badge }));

  // Event Day is off until an admin turns it on — an empty run sheet in the
  // navigation for eleven months of the year reads as a broken page. Admins
  // keep the link so there is a way back to the switch. Hiding it is a display
  // decision only: /event still checks permissions for itself.
  const eventVisible = settings[SETTING_KEYS.eventPanel] === "1";
  if ((eventVisible || isAdmin(viewer)) && sees("event")) {
    items.push({
      href: "/event",
      label: eventVisible ? "Event Day" : "Event Day (hidden)",
    });
  }

  // Teams notifications are a head's tool, so the link appears for anyone who
  // may send to at least one department. `can()` decides; this only draws.
  const canNotify =
    can(viewer, "notify", { kind: "notification", departmentId: null }) ||
    (viewer.departmentId !== null &&
      can(viewer, "notify", { kind: "notification", departmentId: viewer.departmentId }));
  if (canNotify && sees("notifications")) {
    items.push({ href: "/notifications", label: "Teams alerts" });
  }

  if (isAdmin(viewer) && sees("admin")) items.push({ href: "/admin", label: "Admin" });
  if (isAdmin(viewer) && sees("audit")) items.push({ href: "/admin/audit", label: "Audit log" });

  return (
    <div className="lg:flex">
      {/* useSearchParams inside the nav's search box needs a Suspense boundary
          or the whole app layout opts out of static rendering. */}
      <Suspense fallback={null}>
        <AppNav
          items={items}
          viewer={{
            name: viewer.name,
            nickname: viewer.nickname,
            avatarUrl: safeHref(viewer.avatarUrl) ?? null,
            tier: viewer.tier,
            departmentName: viewer.department?.name ?? null,
          }}
          signOutAction={signOut}
        />
      </Suspense>

      <main
        id="hs-main"
        tabIndex={-1}
        className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
      >
        <div className="mx-auto max-w-6xl">
          {/* The owner's per-page access control. Renders for T4 only, and sits
              above the page rather than inside it so no page has to know it
              exists. */}
          {here && isOwner(viewer) ? (
            <PageAccessBar key={here.key} page={here.key} row={(await pageMatrix())[here.key]} />
          ) : null}
          {children}
        </div>
      </main>

      <ContactButton lineUrl={safeHref(settings[SETTING_KEYS.contactLine]) ?? null} />
    </div>
  );
}
