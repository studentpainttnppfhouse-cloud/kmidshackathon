import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { AnnouncementForm } from "@/components/content-forms";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New announcement" };
export const dynamic = "force-dynamic";

export default async function NewAnnouncementPage() {
  const viewer = await requireViewer();
  const departments = await db.department.findMany({ orderBy: { sortOrder: "asc" } });

  const canBroadcast = can(viewer, "create", {
    kind: "announcement",
    departmentId: null,
    authorId: viewer.id,
  });
  const postable = departments.filter((d) =>
    can(viewer, "create", { kind: "announcement", departmentId: d.id, authorId: viewer.id }),
  );

  if (!canBroadcast && postable.length === 0) {
    return (
      <div className="hs-enter space-y-4">
        <PageHeader eyebrow="Announcements" title="Only heads and admins post here" />
        <p className="text-sm text-muted">
          Announcements go out to a whole department or the whole team, so posting one is a head's
          call. Ask yours.
        </p>
        <Link href="/announcements" className="hs-btn hs-btn-secondary">
          Back to announcements
        </Link>
      </div>
    );
  }

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Announcements"
        title="Post an announcement"
        subtitle="Urgent things still go to LINE. This is where they stay findable afterwards."
        action={
          <Link href="/announcements" className="hs-btn hs-btn-ghost">
            Cancel
          </Link>
        }
      />
      <div className="hs-card p-5 sm:p-6">
        <AnnouncementForm
          departments={(canBroadcast ? departments : postable).map((d) => ({
            id: d.id,
            name: d.name,
          }))}
          canBroadcast={canBroadcast}
          defaultDepartmentId={viewer.departmentId ?? undefined}
        />
      </div>
    </div>
  );
}
