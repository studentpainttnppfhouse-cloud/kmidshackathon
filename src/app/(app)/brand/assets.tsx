import Link from "next/link";
import { db } from "@/lib/db";
import { can, type Viewer } from "@/lib/authorize";
import { assetLinks } from "@/lib/attachment-access";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

/** Every shared file and asset, shown as a section of the Brand kit. */
export async function AssetsSection({
  viewer,
  q,
  dept,
  tag,
}: {
  viewer: Viewer;
  q?: string;
  dept?: string;
  tag?: string;
}) {
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

  const assetHrefs = await assetLinks(visible);

  const allTags = [
    ...new Set(readable.flatMap((f) => (Array.isArray(f.tags) ? (f.tags as string[]) : []))),
  ].sort();

  const canCreate = departments.some((d) =>
    can(viewer, "create", { kind: "file", departmentId: d.id, ownerId: viewer.id }),
  );

  return (
    <Card id="assets" className="scroll-mt-6">
      <SectionTitle
        action={
          canCreate ? (
            <Link href="/files/new" className="text-sm font-semibold text-brand-deep">
              ＋ Add an asset
            </Link>
          ) : null
        }
      >
        Files & assets
      </SectionTitle>
      <div className="space-y-4">

      <form action="/brand#assets" className="flex flex-wrap gap-2">
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
            href="/brand#assets"
            className={`hs-pill ${!tag ? "bg-tint-strong text-brand-deep" : "bg-surface text-muted"}`}
          >
            All tags
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={`/brand?tag=${encodeURIComponent(t)}#assets`}
              className={`hs-pill ${tag === t ? "bg-tint-strong text-brand-deep" : "bg-surface text-muted"}`}
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
            const link = assetHrefs.get(f.id);

            return (
              <a
                key={f.id}
                // A row whose link failed the scheme allowlist, or whose
                // upload is gone, resolves to nothing at all — a dead anchor
                // rather than an executable one.
                href={link?.href ?? "#"}
                {...(link?.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                className="hs-card p-4"
              >
                <span className="mb-1.5 flex items-center gap-2">
                  <span className="hs-pill bg-tint text-brand-deep">{f.kind}</span>
                  {link && !link.external ? (
                    <span className="hs-pill bg-ok-soft text-ok-strong">In the portal</span>
                  ) : null}
                  {f.isBrandKit ? (
                    <span className="hs-pill bg-violet-soft text-violet-strong">Brand</span>
                  ) : null}
                </span>
                <span className="block text-sm font-bold text-ink">
                  {f.name}
                  {link?.external ? " ↗" : ""}
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
                </span>
              </a>
            );
          })}
        </div>
      )}
      </div>
    </Card>
  );
}
