import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { assetLinkProps, isStored } from "@/lib/assets";
import { deleteFile } from "@/lib/actions/content";
import { ConfirmDelete } from "@/components/confirm-delete";
import { formatBytes, uploadQuotaBytes } from "@/lib/uploads";
import { Banner, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Files & Assets" };
export const dynamic = "force-dynamic";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; tag?: string; saved?: string }>;
}) {
  const viewer = await requireViewer();
  const { q, dept, tag, saved } = await searchParams;

  const where: Prisma.FileAssetWhereInput = { deletedAt: null };
  if (dept) where.department = { slug: dept };
  if (q) where.OR = [{ name: { contains: q } }, { description: { contains: q } }];

  const [files, departments, stored] = await Promise.all([
    db.fileAsset.findMany({
      where,
      include: {
        department: { select: { name: true, color: true, slug: true } },
        uploadedBy: { select: { name: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
    db.fileAsset.aggregate({ where: { storage: "db" }, _sum: { sizeBytes: true }, _count: true }),
  ]);

  // Tag filtering happens here rather than in SQL: TiDB is MySQL, so the tags
  // column is plain JSON with no GIN-style index to search against.
  const readable = files.filter((f) =>
    can(viewer, "read", { kind: "file", departmentId: f.departmentId, ownerId: f.uploadedById }),
  );

  const visible = tag
    ? readable.filter((f) => Array.isArray(f.tags) && (f.tags as string[]).includes(tag))
    : readable;

  const allTags = [
    ...new Set(readable.flatMap((f) => (Array.isArray(f.tags) ? (f.tags as string[]) : []))),
  ].sort();

  const canCreate = departments.some((d) =>
    can(viewer, "create", { kind: "file", departmentId: d.id, ownerId: viewer.id }),
  );

  const usedBytes = stored._sum.sizeBytes ?? 0;
  const usedLabel =
    stored._count === 0
      ? `nothing stored yet, out of ${formatBytes(uploadQuotaBytes())}`
      : `${formatBytes(usedBytes)} of ${formatBytes(uploadQuotaBytes())} used`;

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Files & assets"
        title="The team's shelf"
        subtitle="Every logo, template and deck the team has — uploaded here, or linked to where it lives."
        action={
          canCreate ? (
            <Link href="/files/new" className="hs-btn hs-btn-primary">
              <span aria-hidden="true">＋</span> Add an asset
            </Link>
          ) : null
        }
      />

      {saved ? (
        <Banner tone="ok">
          Saved. The file is in the portal&rsquo;s database now — deploys, new laptops and graduating
          seniors all leave it exactly where it is.
        </Banner>
      ) : null}

      <Banner tone="info">
        Uploaded files are stored in the database, so they survive every deploy — {usedLabel}.
        Links are still the right answer for anything huge or still being edited in Canva.
      </Banner>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder="Search assets…"
          className="hs-input max-w-xs"
          aria-label="Search assets"
        />
        <select name="dept" defaultValue={dept ?? ""} className="hs-input max-w-[200px]">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>
        <button type="submit" className="hs-btn hs-btn-secondary">
          Search
        </button>
      </form>

      {allTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/files"
            className={`hs-pill ${!tag ? "bg-pink-100 text-pink-700" : "bg-white text-muted"}`}
          >
            All tags
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={`/files?tag=${encodeURIComponent(t)}`}
              className={`hs-pill ${tag === t ? "bg-pink-100 text-pink-700" : "bg-white text-muted"}`}
            >
              {t}
            </Link>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          hint="Add the first asset, or clear the filters."
          action={
            canCreate ? (
              <Link href="/files/new" className="hs-btn hs-btn-primary mt-2">
                Add an asset
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((f) => {
            const removable = can(viewer, "delete", {
              kind: "file",
              departmentId: f.departmentId,
              ownerId: f.uploadedById,
            });

            return (
              <div key={f.id} className="hs-card flex flex-col p-4">
                <a
                  // assetLinkProps decides between the stored-file route and the
                  // external link, and runs the same scheme allowlist at render
                  // time: a row written before that check existed becomes a dead
                  // link rather than an executable one.
                  {...assetLinkProps(f)}
                  className="block flex-1"
                >
                  <span className="mb-1.5 flex items-center gap-2">
                    <span className="hs-pill bg-pink-50 text-pink-700">{f.kind}</span>
                    {isStored(f) ? (
                      <span className="hs-pill bg-emerald-50 text-emerald-700">In the portal</span>
                    ) : null}
                    {f.isBrandKit ? (
                      <span className="hs-pill bg-violet-50 text-violet-700">Brand</span>
                    ) : null}
                  </span>
                  <span className="block text-sm font-bold text-ink">
                    {f.name} {isStored(f) ? "↓" : "↗"}
                  </span>
                  {f.description ? (
                    <span className="mt-1 block line-clamp-2 text-xs text-muted">
                      {f.description}
                    </span>
                  ) : null}
                  <span className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: f.department.color }}
                    />
                    {f.department.name} · {f.uploadedBy.nickname || f.uploadedBy.name} ·{" "}
                    {formatDate(f.createdAt)}
                    {isStored(f) && f.sizeBytes ? ` · ${formatBytes(f.sizeBytes)}` : ""}
                  </span>
                </a>

                {removable ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <ConfirmDelete
                      action={async () => {
                        "use server";
                        await deleteFile(f.id);
                      }}
                      title={`Remove “${f.name}”?`}
                      body={
                        isStored(f)
                          ? "It goes to the recycle bin with its contents intact — an admin can put it back."
                          : "It goes to the recycle bin. The file in Drive is not touched."
                      }
                      label="Remove"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
