import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, can, isAdmin } from "@/lib/authorize";
import { markAnnouncementRead } from "@/lib/actions/content";
import Link from "next/link";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/dates";

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
        author: { select: { id: true, name: true, nickname: true, avatarUrl: true } },
        department: { select: { name: true, color: true } },
        reads: { where: { userId: viewer.id }, select: { readAt: true } },
        _count: { select: { reads: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const canBroadcast = can(viewer, "create", {
    kind: "announcement",
    departmentId: null,
    authorId: viewer.id,
  });

  const postable = departments.filter((d) =>
    can(viewer, "create", { kind: "announcement", departmentId: d.id, authorId: viewer.id }),
  );

  const activeStaff = await db.user.count({ where: { deletedAt: null, isActive: true } });

  const canPost = canBroadcast || postable.length > 0;

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Announcements"
        title="The record, not the alarm"
        subtitle="Urgent things still go to LINE. This is where they stay findable."
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
        <div className="space-y-3">
          {announcements.map((n) => {
            const unread = n.reads.length === 0;
            return (
              <article
                key={n.id}
                className={`hs-card p-5 ${unread ? "border-pink-300 bg-pink-50/30" : ""}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {n.pinned ? (
                    <span className="hs-pill bg-amber-50 text-amber-700">📌 Pinned</span>
                  ) : null}
                  {n.department ? (
                    <span className="hs-pill text-white" style={{ background: n.department.color }}>
                      {n.department.name}
                    </span>
                  ) : (
                    <span className="hs-pill bg-pink-100 text-pink-700">All staff</span>
                  )}
                  {unread ? (
                    <span className="hs-pill bg-brand text-white">New</span>
                  ) : null}
                </div>

                <h2 className="hs-h2">{n.title}</h2>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {n.body}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#f6ecf2] pt-3">
                  <span className="flex items-center gap-1.5 text-xs text-faint">
                    <Avatar
                      name={n.author.name}
                      nickname={n.author.nickname}
                      url={n.author.avatarUrl}
                      size={20}
                    />
                    {n.author.nickname || n.author.name} · {timeAgo(n.createdAt)}
                  </span>

                  <span className="flex items-center gap-3">
                    {isAdmin(viewer) ? (
                      <span className="text-xs text-faint">
                        Read by {n._count.reads}/{activeStaff}
                      </span>
                    ) : null}
                    {unread ? (
                      <form
                        action={async () => {
                          "use server";
                          await markAnnouncementRead(n.id);
                        }}
                      >
                        <button type="submit" className="hs-btn hs-btn-secondary px-3 py-1.5 text-xs">
                          Mark read
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-emerald-600">✓ Read</span>
                    )}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

    </div>
  );
}
