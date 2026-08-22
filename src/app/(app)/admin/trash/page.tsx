import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireTier, isOwner } from "@/lib/authorize";
import { restoreDeleted, type Deletable } from "@/lib/actions/admin";
import { purgeFile } from "@/lib/actions/content";
import { formatBytes } from "@/lib/uploads";
import { ConfirmDelete } from "@/components/confirm-delete";
import { RestoreButton } from "@/components/restore-button";
import { Banner, Card, EmptyState, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { formatDateLong } from "@/lib/dates";

export const metadata: Metadata = { title: "Recycle bin" };
export const dynamic = "force-dynamic";

/**
 * The recycle bin.
 *
 * Deleting anything in this portal has always been a soft delete — but until
 * this page existed, "an admin can restore it" meant an admin with a database
 * client, which is nobody at 11pm the night before the event. Every deleted
 * row is listed here with one button that brings it back.
 *
 * Only uploaded files can be destroyed for real, and only by T4: their bytes
 * are the one kind of deleted row that costs storage.
 */

type Row = {
  id: string;
  title: string;
  detail: string;
  deletedAt: Date | null;
  bytes?: number | null;
};

function Section({
  type,
  heading,
  rows,
  canPurge,
}: {
  type: Deletable;
  heading: string;
  rows: Row[];
  canPurge?: boolean;
}) {
  return (
    <Card>
      <SectionTitle>
        {heading} ({rows.length})
      </SectionTitle>
      {rows.length === 0 ? (
        <EmptyState title="Nothing deleted" />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{row.title}</p>
                <p className="text-xs text-faint">
                  {row.detail}
                  {row.deletedAt ? ` · deleted ${formatDateLong(row.deletedAt)}` : ""}
                  {row.bytes ? ` · ${formatBytes(row.bytes)} still stored` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <RestoreButton
                  action={async () => {
                    "use server";
                    await restoreDeleted(type, row.id);
                  }}
                  title={`Restore “${row.title}”?`}
                  body="It goes straight back where it was, with everything attached to it."
                  label="Restore"
                />
                {canPurge ? (
                  <ConfirmDelete
                    action={async () => {
                      "use server";
                      await purgeFile(row.id);
                    }}
                    title={`Delete “${row.title}” for good?`}
                    body="This frees the storage and cannot be undone. Download it first if there is any doubt."
                    confirmLabel="Destroy it"
                    label="Delete for good"
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function TrashPage() {
  const viewer = await requireTier("T3_ADMIN");
  const owner = isOwner(viewer);

  const deleted = { deletedAt: { not: null } } as const;

  const [assignments, documents, files, announcements, forms] = await Promise.all([
    db.assignment.findMany({
      where: deleted,
      include: { department: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take: 100,
    }),
    db.document.findMany({
      where: deleted,
      include: { department: { select: { name: true } }, owner: { select: { name: true, nickname: true } } },
      orderBy: { deletedAt: "desc" },
      take: 100,
    }),
    db.fileAsset.findMany({
      where: deleted,
      include: { department: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take: 100,
    }),
    db.announcement.findMany({ where: deleted, orderBy: { deletedAt: "desc" }, take: 100 }),
    db.form.findMany({ where: deleted, orderBy: { deletedAt: "desc" }, take: 100 }),
  ]);

  const total =
    assignments.length + documents.length + files.length + announcements.length + forms.length;
  const reclaimable = files.reduce((sum, f) => sum + (f.storage === "db" ? (f.sizeBytes ?? 0) : 0), 0);

  return (
    <div className="hs-enter space-y-5">
      <Link href="/admin" className="text-sm font-semibold text-pink-600">
        ← Admin
      </Link>

      <PageHeader
        eyebrow="Administration"
        title="Recycle bin"
        subtitle="Nothing in this portal is deleted outright. Everything below is still in the database, waiting to be put back."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Items deleted" value={total} tone={total > 0 ? "warn" : "default"} />
        <Stat label="Uploads held" value={files.filter((f) => f.storage === "db").length} />
        <Stat label="Storage reclaimable" value={formatBytes(reclaimable)} />
      </div>

      {owner ? null : (
        <Banner tone="info">
          Restoring is yours to do. Destroying an upload for good is the owner&rsquo;s alone, which
          is why those buttons are not here.
        </Banner>
      )}

      <Section
        type="assignment"
        heading="Tasks"
        rows={assignments.map((a) => ({
          id: a.id,
          title: a.title,
          detail: a.department.name,
          deletedAt: a.deletedAt,
        }))}
      />

      <Section
        type="document"
        heading="Documents"
        rows={documents.map((d) => ({
          id: d.id,
          title: d.title,
          detail: `${d.department.name} · ${d.owner.nickname || d.owner.name} · v${d.version}`,
          deletedAt: d.deletedAt,
        }))}
      />

      <Section
        type="file"
        heading="Files & assets"
        canPurge={owner}
        rows={files.map((f) => ({
          id: f.id,
          title: f.name,
          detail: `${f.department.name} · ${f.storage === "db" ? "stored here" : "link"}`,
          deletedAt: f.deletedAt,
          bytes: f.storage === "db" ? f.sizeBytes : null,
        }))}
      />

      <Section
        type="announcement"
        heading="Announcements"
        rows={announcements.map((a) => ({
          id: a.id,
          title: a.title,
          detail: a.scope === "all" ? "All staff" : "One department",
          deletedAt: a.deletedAt,
        }))}
      />

      <Section
        type="form"
        heading="Forms"
        rows={forms.map((f) => ({
          id: f.id,
          title: f.title,
          detail: `${f.type} · ${f.responseCount} responses`,
          deletedAt: f.deletedAt,
        }))}
      />
    </div>
  );
}
