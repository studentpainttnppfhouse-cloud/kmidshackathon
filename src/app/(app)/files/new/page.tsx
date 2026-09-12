import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAccess, can } from "@/lib/authorize";
import { FileForm } from "@/components/content-forms";
import { Banner, PageHeader } from "@/components/ui";
import { MAX_UPLOAD_BYTES, formatBytes } from "@/lib/attachments";

export const metadata: Metadata = { title: "Add an asset" };
export const dynamic = "force-dynamic";

export default async function NewFilePage() {
  // A composer, not a page: a tier held at Read on files never reaches it.
  const viewer = await requirePageAccess("files", "edit");

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
        title="Add an asset"
        action={
          <Link href="/files" className="hs-btn hs-btn-ghost">
            Cancel
          </Link>
        }
      />

      <Banner tone="info">
        Files up to {formatBytes(MAX_UPLOAD_BYTES)} are stored in the portal database, which
        survives every redeploy — Render&rsquo;s own disk does not, which is why they do not go
        there. Anything bigger stays in Drive or Canva and gets linked instead.
      </Banner>

      <div className="hs-card p-5 sm:p-6">
        <FileForm
          departments={creatable.map((d) => ({ id: d.id, name: d.name }))}
          maxBytes={MAX_UPLOAD_BYTES}
        />
      </div>
    </div>
  );
}
