import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { isAdmin, isOwner } from "@/lib/authorize";
import { signOut } from "@/lib/actions/auth";
import { SETTING_KEYS, getSettings } from "@/lib/settings";
import { safeHref } from "@/lib/url";
import { AppNav, type NavItem } from "@/components/nav";
import { ContactButton } from "@/components/chrome";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profileCompletedAt) redirect("/welcome");

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

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/assignments", label: "Assignments", badge: myOpenTasks || undefined },
    { href: "/departments", label: "Departments" },
    { href: "/people", label: "People" },
    { href: "/documents", label: "Documents" },
    { href: "/files", label: "Files & Assets" },
    { href: "/brand", label: "Brand Kit" },
    { href: "/forms", label: "Forms" },
    {
      href: "/announcements",
      label: "Announcements",
      badge: unreadAnnouncements || undefined,
    },
  ];

  // Event Day is off until an admin turns it on — an empty run sheet in the
  // navigation for eleven months of the year reads as a broken page. Admins
  // keep the link so there is a way back to the switch. Hiding it is a display
  // decision only: /event still checks permissions for itself.
  const eventVisible = settings[SETTING_KEYS.eventPanel] === "1";
  if (eventVisible || isAdmin(viewer)) {
    items.push({
      href: "/event",
      label: eventVisible ? "Event Day" : "Event Day (hidden)",
    });
  }

  if (isAdmin(viewer)) items.push({ href: "/admin", label: "Admin" });
  if (isOwner(viewer)) items.push({ href: "/admin/audit", label: "Audit log" });

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
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <ContactButton lineUrl={safeHref(settings[SETTING_KEYS.contactLine]) ?? null} />
    </div>
  );
}
