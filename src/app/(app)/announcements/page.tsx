import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, can, isAdmin } from "@/lib/authorize";
import { markAnnouncementRead } from "@/lib/actions/content";
import Link from "next/link";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/dates";
import { swatchStyle } from "@/lib/color";
import { Attachments } from "@/components/attachments";
import { attachmentsByParent } from "@/lib/attachment-access";
import { MAX_UPLOAD_BYTES } from "@/lib/attachments";

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

  const [activeStaff, filesByAnnouncement] = await Promise.all([
    db.user.count({ where: { deletedAt: null, isActive: true } }),
    attachmentsByParent(
      "announcement",
      announcements.map((n) => n.id),
    ),
  ]);

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
                className={`hs-card p-5 ${unread ? "border-brand bg-tint/30" : ""}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
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

                <h2 className="hs-h2">{n.title}</h2>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {n.body}
                </p>

                {/* A notice with a poster attached to it is one message, not a
                    message and a hunt through Drive. The author and their head
                    can add files; everybody who can read the notice can open
                    them. */}
                {(() => {
                  const files = filesByAnnouncement.get(n.id) ?? [];
                  const mayAttach = can(viewer, "update", {
                    kind: "announcement",
                    departmentId: n.departmentId,
                    authorId: n.authorId,
                  });
                  if (files.length === 0 && !mayAttach) return null;

                  return (
                    <div className="mt-4 border-t border-line-soft pt-3">
                      <Attachments
                        parentType="announcement"
                        parentId={n.id}
                        canWrite={mayAttach}
                        attachments={files}
                        viewerId={viewer.id}
                        maxBytes={MAX_UPLOAD_BYTES}
                        title="Files"
                      />
                    </div>
                  );
                })()}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
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
                      <span className="text-xs text-ok-strong">✓ Read</span>
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
