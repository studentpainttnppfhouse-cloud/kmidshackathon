import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { EmptyState, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/dates";
import { swatchStyle } from "@/lib/color";

export const metadata: Metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const viewer = await requireViewer();

  const [announcements, departments] = await Promise.all([
    db.announcement.findMany({
      where: {
        deletedAt: null,
        OR: [{ scope: "all" }, { departmentId: viewer.departmentId ?? "__none__" }],
      },
      include: {
        author: { select: { name: true, nickname: true } },
        department: { select: { name: true, color: true } },
        reads: { where: { userId: viewer.id }, select: { readAt: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const canPost =
    can(viewer, "create", { kind: "announcement", departmentId: null, authorId: viewer.id }) ||
    departments.some((d) =>
      can(viewer, "create", { kind: "announcement", departmentId: d.id, authorId: viewer.id }),
    );
  const canSeeAutomatic =
    can(viewer, "notify", { kind: "notification", departmentId: null }) ||
    departments.some((d) => can(viewer, "notify", { kind: "notification", departmentId: d.id }));

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Staff"
        title="Announcements"
        action={
          canPost ? (
            <Link href="/announcements/new" className="hs-btn hs-btn-primary">
              <span aria-hidden="true">＋</span> New announcement
            </Link>
          ) : null
        }
      />

      {announcements.length === 0 ? (
        <EmptyState title="Nothing posted yet" />
      ) : (
        <ul className="space-y-3">
          {announcements.map((n) => {
            const unread = n.reads.length === 0;
            return (
              <li key={n.id}>
                <Link
                  href={`/announcements/${n.id}`}
                  className={`hs-card block p-5 transition hover:border-brand ${unread ? "border-brand bg-tint/30" : ""}`}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {n.pinned ? (
                      <span className="hs-pill bg-warn-soft text-warn-strong">📌 Pinned</span>
                    ) : null}
                    {n.department ? (
                      <span className="hs-pill" style={swatchStyle(n.department.color)}>
                        {n.department.name}
                      </span>
                    ) : (
                      <span className="hs-pill bg-tint-strong text-brand-deep">All staff</span>
                    )}
                    {unread ? (
                      <span className="hs-pill bg-brand-solid text-on-brand">New</span>
                    ) : null}
                  </div>
                  <h2 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
                    {n.title}
                  </h2>
                  <p className="mt-2 text-xs text-faint">
                    {n.author.nickname || n.author.name} · {timeAgo(n.createdAt)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {canSeeAutomatic ? (
        <p className="pt-4 text-center text-xs text-faint">
          <Link href="/announcements/automatic" className="underline hover:text-muted">
            Automatic messages
          </Link>
        </p>
      ) : null}
    </div>
  );
}
