import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { excerpt } from "@/lib/markdown";
import { Avatar, DocStatusPill, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

const SOURCES = ["portal", "external"] as const;
const STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED"] as const;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; status?: string; source?: string }>;
}) {
  const viewer = await requireViewer();
  const { q, dept, status, source } = await searchParams;

  const where: Prisma.DocumentWhereInput = { deletedAt: null };
  if (dept) where.department = { slug: dept };

  // Query-string values decide a database filter, so they are checked against
  // the known set rather than cast. `status as DocStatus` would have handed
  // Prisma whatever the URL contained.
  if (status && (STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof STATUSES)[number];
  }
  if (source && (SOURCES as readonly string[]).includes(source)) {
    where.source = source;
  }
  if (q) {
    where.OR = [{ title: { contains: q } }, { description: { contains: q } }, { body: { contains: q } }];
  }

  const [documents, departments] = await Promise.all([
    db.document.findMany({
      where,
      include: {
        department: { select: { name: true, color: true, slug: true } },
        owner: { select: { id: true, name: true, nickname: true, avatarUrl: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  // The index shows only what this account may read. `can()` decides, not the
  // WHERE clause — the policy lives in one file and this is a caller of it.
  const visible = documents.filter((d) =>
    can(viewer, "read", { kind: "document", departmentId: d.departmentId, ownerId: d.ownerId }),
  );

  const canCreate = departments.some((d) =>
    can(viewer, "create", { kind: "document", departmentId: d.id, ownerId: viewer.id }),
  );

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Documents"
        title="Everything official, in one index"
        subtitle="Write a document in the portal and export it to Word, PDF or Markdown — or keep the index pointed at Google Drive."
        action={
          canCreate ? (
            <Link href="/documents/new" className="hs-btn hs-btn-primary">
              <span aria-hidden="true">＋</span> New document
            </Link>
          ) : null
        }
      />

      <form className="flex flex-wrap gap-2" role="search">
        <label htmlFor="doc-q" className="sr-only">
          Search documents
        </label>
        <input
          id="doc-q"
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder="Search titles, summaries, contents…"
          className="hs-input max-w-xs"
        />
        <select name="dept" defaultValue={dept ?? ""} className="hs-input max-w-[200px]" aria-label="Department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} className="hs-input max-w-[160px]" aria-label="Status">
          <option value="">Any status</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_REVIEW">In review</option>
          <option value="APPROVED">Approved</option>
          <option value="PUBLISHED">Published</option>
        </select>
        <select name="source" defaultValue={source ?? ""} className="hs-input max-w-[170px]" aria-label="Where it lives">
          <option value="">Anywhere</option>
          <option value="portal">Written in the portal</option>
          <option value="external">Linked from Drive</option>
        </select>
        <button type="submit" className="hs-btn hs-btn-secondary">
          Search
        </button>
      </form>

      {visible.length === 0 ? (
        <EmptyState
          title="No documents match"
          hint="Clear the filters, or start a new one."
          action={
            canCreate ? (
              <Link href="/documents/new" className="hs-btn hs-btn-primary mt-2">
                New document
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((d) => (
            <Link key={d.id} href={`/documents/${d.id}`} className="hs-card block p-4">
              <span className="mb-2 flex items-start justify-between gap-3">
                <span className="min-w-0 text-sm font-bold text-ink">{d.title}</span>
                <DocStatusPill status={d.status} />
              </span>

              <span className="mb-2 block line-clamp-2 text-xs text-muted">
                {d.description || (d.body ? excerpt(d.body, 140) : "No summary yet.")}
              </span>

              <span className="mb-2 flex flex-wrap gap-1">
                <span className="hs-pill bg-tint text-brand-deep">
                  {d.source === "portal" ? "In portal" : "Drive link"}
                </span>
                {Array.isArray(d.tags)
                  ? (d.tags as string[]).slice(0, 3).map((tag) => (
                      <span key={tag} className="hs-pill bg-neutral-soft text-neutral-strong">
                        {tag}
                      </span>
                    ))
                  : null}
              </span>

              <span className="flex items-center justify-between gap-2 text-[11px] text-faint">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: d.department.color }}
                    aria-hidden="true"
                  />
                  {d.department.name}
                </span>
                <span className="flex items-center gap-1.5">
                  <Avatar
                    name={d.owner.name}
                    nickname={d.owner.nickname}
                    url={d.owner.avatarUrl}
                    size={18}
                  />
                  {d.owner.nickname || d.owner.name} · {formatDate(d.updatedAt)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
