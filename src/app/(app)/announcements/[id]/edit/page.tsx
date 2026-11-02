import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageAccess, can, isAdmin } from "@/lib/authorize";
import { AnnouncementForm } from "@/components/content-forms";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Edit announcement" };
export const dynamic = "force-dynamic";

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePageAccess("announcements", "edit");
  const { id } = await params;
  const n = await db.announcement.findUnique({ where: { id } });
  if (!n || n.deletedAt) notFound();
  if (
    !isAdmin(viewer) &&
    !can(viewer, "update", { kind: "announcement", departmentId: n.departmentId, authorId: n.authorId })
  ) {
    redirect(`/announcements/${id}`);
  }

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Announcements"
        title="Edit announcement"
        action={
          <Link href={`/announcements/${id}`} className="hs-btn hs-btn-ghost">
            Cancel
          </Link>
        }
      />
      <div className="hs-card p-5 sm:p-6">
        <AnnouncementForm
          departments={[]}
          canBroadcast={false}
          editing={{ id: n.id, title: n.title, body: n.body, pinned: n.pinned }}
        />
      </div>
    </div>
  );
}
