import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { FileForm } from "@/components/content-forms";
import { Banner, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Link an asset" };
export const dynamic = "force-dynamic";

export default async function NewFilePage() {
  const viewer = await requireViewer();

  const departments = await db.department.findMany({ orderBy: { sortOrder: "asc" } });
  const creatable = departments.filter((d) =>
    can(viewer, "create", { kind: "file", departmentId: d.id, ownerId: viewer.id }),
  );

  if (creatable.length === 0) {
    return (
      <div className="hs-enter space-y-4">
        <PageHeader eyebrow="Files & assets" title="You cannot add assets yet" />
        <p className="text-sm text-muted">Assets are filed into a department. Ask an admin to put your account in one.</p>
        <Link href="/files" className="hs-btn hs-btn-secondary">
          Back to assets
        </Link>
      </div>
    );
  }

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Files & assets"
        title="Link an asset"
        action={
          <Link href="/files" className="hs-btn hs-btn-ghost">
            Cancel
          </Link>
        }
      />

      <Banner tone="info">
        The portal stores links, not files. Keep the actual bytes in Drive or Canva — Render wipes
        its own disk on every deploy, so anything uploaded here would vanish the next time the
        portal updates.
      </Banner>

      <div className="hs-card p-5 sm:p-6">
        <FileForm departments={creatable.map((d) => ({ id: d.id, name: d.name }))} />
      </div>
    </div>
  );
}
