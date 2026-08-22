import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { FileForm } from "@/components/content-forms";
import { Banner, PageHeader } from "@/components/ui";
import { formatBytes, maxUploadBytes } from "@/lib/uploads";

export const metadata: Metadata = { title: "Add an asset" };
export const dynamic = "force-dynamic";

export default async function NewFilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const viewer = await requireViewer();
  const { error } = await searchParams;

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

  const max = maxUploadBytes();

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
        Uploads go into the portal&rsquo;s database, not onto the server&rsquo;s disk — so they
        survive every deploy and stay here even if the person who made them leaves. Up to{" "}
        {formatBytes(max)} per file. Anything bigger, or anything still being edited in Canva, is
        better as a link.
      </Banner>

      <div className="hs-card p-5 sm:p-6">
        <FileForm
          departments={creatable.map((d) => ({ id: d.id, name: d.name }))}
          maxBytes={max}
          // Uploads post to a route handler, so a rejected one comes back as a
          // redirect with the reason in the query string rather than as form state.
          error={error ? error.slice(0, 300) : undefined}
        />
      </div>
    </div>
  );
}
