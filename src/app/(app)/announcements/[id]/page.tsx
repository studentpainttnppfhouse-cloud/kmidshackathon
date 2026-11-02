import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireViewer, can, isAdmin } from "@/lib/authorize";
import { markAnnouncementRead, deleteAnnouncement } from "@/lib/actions/content";
import { Avatar, PageHeader } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Attachments } from "@/components/attachments";
import { attachmentsByParent } from "@/lib/attachment-access";
import { MAX_UPLOAD_BYTES, canRenderInline, kindOf } from "@/lib/attachments";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Announcement" };
export const dynamic = "force-dynamic";

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;

  const n = await db.announcement.findUnique({
    where: { id },
    include: {
      author: { select: { name: true, nickname: true, avatarUrl: true } },
      department: { select: { name: true } },
    },
  });
  if (
    !n ||
    n.deletedAt ||
    !can(viewer, "read", { kind: "announcement", departmentId: n.departmentId, authorId: n.authorId })
  ) {
    notFound();
  }

  // Opening the page is reading it.
  await markAnnouncementRead(n.id);

  const files = (await attachmentsByParent("announcement", [n.id])).get(n.id) ?? [];
  const resource = { kind: "announcement" as const, departmentId: n.departmentId, authorId: n.authorId };
  const mayEdit = can(viewer, "update", resource) || isAdmin(viewer);
  const images = files.filter(
    (f) => f.storage !== "link" && kindOf(f.mimeType) === "image" && canRenderInline(f.mimeType),
  );

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow={n.department?.name ?? "All staff"}
        title={n.title}
        action={
          <>
            <Link href="/announcements" className="hs-btn hs-btn-ghost">
              Back
            </Link>
            {mayEdit ? (
              <>
                <Link href={`/announcements/${n.id}/edit`} className="hs-btn hs-btn-secondary">
                  Edit
                </Link>
                <ConfirmDelete
                  action={deleteAnnouncement.bind(null, n.id)}
                  label="Delete"
                  title="Delete this announcement?"
                  body="It disappears for everyone."
                  confirmLabel="Delete it"
                />
              </>
            ) : null}
          </>
        }
      />

      <article className="hs-card space-y-5 p-5 sm:p-6">
        <p className="flex items-center gap-1.5 text-xs text-faint">
          <Avatar name={n.author.name} nickname={n.author.nickname} url={n.author.avatarUrl} size={20} />
          {n.author.nickname || n.author.name} · {formatDateTime(n.createdAt)}
        </p>

        {images.length > 0 ? (
          <div className="space-y-3">
            {images.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={f.id}
                src={`/api/attachments/${f.id}?inline=1`}
                alt={f.name}
                className="max-h-[32rem] w-full rounded-xl border border-line object-contain"
              />
            ))}
          </div>
        ) : null}

        <p className="whitespace-pre-wrap text-base leading-relaxed text-ink">{n.body}</p>

        {files.length > 0 || mayEdit ? (
          <div className="border-t border-line-soft pt-4">
            <Attachments
              parentType="announcement"
              parentId={n.id}
              canWrite={mayEdit}
              attachments={files}
              viewerId={viewer.id}
              maxBytes={MAX_UPLOAD_BYTES}
              title="Files"
            />
          </div>
        ) : null}
      </article>
    </div>
  );
}
