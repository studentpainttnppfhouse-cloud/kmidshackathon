import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { safeHref } from "@/lib/url";
import { Banner, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Files & Assets" };
export const dynamic = "force-dynamic";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; tag?: string }>;
}) {
  const viewer = await requireViewer();
  const { q, dept, tag } = await searchParams;

  const where: Prisma.FileAssetWhereInput = { deletedAt: null };
  if (dept) where.department = { slug: dept };
  if (q) where.OR = [{ name: { contains: q } }, { description: { contains: q } }];

  const [files, departments] = await Promise.all([
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

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Files & assets"
        title="The index, not the drive"
        subtitle="Every logo, template and deck the team has, with a link to where the bytes actually live."
        action={
          canCreate ? (
            <Link href="/files/new" className="hs-btn hs-btn-primary">
              <span aria-hidden="true">＋</span> Link an asset
            </Link>
          ) : null
        }
      />

      <Banner tone="info">
        The portal stores links, not files. Keep the actual bytes in Drive or
        Canva — Render wipes its own disk on every deploy, so anything uploaded
        here would vanish the next time the portal updates.
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
          hint="Link the first asset, or clear the filters."
          action={
            canCreate ? (
              <Link href="/files/new" className="hs-btn hs-btn-primary mt-2">
                Link an asset
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((f) => (
            <a
              key={f.id}
              // safeHref again at the point of rendering: an asset row written
              // before the scheme allowlist existed becomes a dead link rather
              // than an executable one.
              href={safeHref(f.externalUrl) ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
              className="hs-card p-4"
            >
              <span className="mb-1.5 flex items-center gap-2">
                <span className="hs-pill bg-pink-50 text-pink-700">{f.kind}</span>
                {f.isBrandKit ? (
                  <span className="hs-pill bg-violet-50 text-violet-700">Brand</span>
                ) : null}
              </span>
              <span className="block text-sm font-bold text-ink">{f.name} ↗</span>
              {f.description ? (
                <span className="mt-1 block line-clamp-2 text-xs text-muted">{f.description}</span>
              ) : null}
              <span className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
                <span className="h-2 w-2 rounded-full" style={{ background: f.department.color }} />
                {f.department.name} · {f.uploadedBy.nickname || f.uploadedBy.name} ·{" "}
                {formatDate(f.createdAt)}
              </span>
            </a>
          ))}
        </div>
      )}

    </div>
  );
}
