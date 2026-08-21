import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { isAdmin, isOwner } from "@/lib/authorize";
import { signOut } from "@/lib/actions/auth";
import { AppNav, type NavItem } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profileCompletedAt) redirect("/welcome");

  const [myOpenTasks, unreadAnnouncements] = await Promise.all([
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
    { href: "/announcements", label: "Announcements", badge: unreadAnnouncements || undefined },
    { href: "/event", label: "Event Day" },
  ];

  if (isAdmin(viewer)) items.push({ href: "/admin", label: "Admin" });
  if (isOwner(viewer)) items.push({ href: "/admin/audit", label: "Audit log" });

  return (
    <div className="lg:flex">
      <AppNav
        items={items}
        viewer={{
          name: viewer.name,
          nickname: viewer.nickname,
          avatarUrl: viewer.avatarUrl,
          tier: viewer.tier,
          departmentName: viewer.department?.name ?? null,
        }}
        signOutAction={signOut}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
