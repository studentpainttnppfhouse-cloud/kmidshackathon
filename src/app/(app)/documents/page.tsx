import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { DocumentForm } from "@/components/content-forms";
import { Avatar, Card, DocStatusPill, EmptyState, SectionTitle } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; status?: string }>;
}) {
  const viewer = await requireViewer();
  const { q, dept, status } = await searchParams;

  const where: Prisma.DocumentWhereInput = { deletedAt: null };
  if (dept) where.department = { slug: dept };
  if (status) where.status = status as Prisma.DocumentWhereInput["status"];
  if (q) {
    // Search covers titles, descriptions and tags — not document bodies, which
    // live in Google. That is the trade-off of decision D3-A.
    where.OR = [{ title: { contains: q } }, { description: { contains: q } }];
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

  const creatable = departments.filter((d) =>
    can(viewer, "create", { kind: "document", departmentId: d.id, ownerId: viewer.id }),
  );
  const canApprove = departments.some((d) =>
    can(viewer, "approve", { kind: "document", departmentId: d.id, ownerId: viewer.id }),
  );

  return (
    <div className="space-y-5">
      <header>
        <p className="hs-eyebrow">Documents</p>
        <h1 className="hs-h1">Everything official, in one index</h1>
      </header>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search titles, descriptions…"
          className="hs-input max-w-xs"
          aria-label="Search documents"
        />
        <select name="dept" defaultValue={dept ?? ""} className="hs-input max-w-[200px]">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} className="hs-input max-w-[160px]">
          <option value="">Any status</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_REVIEW">In review</option>
          <option value="APPROVED">Approved</option>
          <option value="PUBLISHED">Published</option>
        </select>
        <button type="submit" className="hs-btn hs-btn-secondary">
          Search
        </button>
      </form>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents match"
          hint="Add one below, or clear the filters."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {documents.map((d) => (
            <div key={d.id} className="hs-card p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <a
                  href={d.externalUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 text-sm font-bold text-ink hover:text-pink-700"
                >
                  {d.title} ↗
                </a>
                <DocStatusPill status={d.status} />
              </div>

              {d.description ? (
                <p className="mb-2 line-clamp-2 text-xs text-muted">{d.description}</p>
              ) : null}

              {Array.isArray(d.tags) && d.tags.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {(d.tags as string[]).map((t) => (
                    <span key={t} className="hs-pill bg-pink-50 text-pink-700">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center justify-between text-[11px] text-faint">
                <Link
                  href={`/departments/${d.department.slug}`}
                  className="flex items-center gap-1.5 hover:text-pink-600"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: d.department.color }}
                  />
                  {d.department.name}
                </Link>
                <Link href={`/people/${d.owner.id}`} className="flex items-center gap-1.5">
                  <Avatar
                    name={d.owner.name}
                    nickname={d.owner.nickname}
                    url={d.owner.avatarUrl}
                    size={18}
                  />
                  {d.owner.nickname || d.owner.name} · {formatDate(d.updatedAt)}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {creatable.length > 0 ? (
        <Card>
          <SectionTitle>Add a document</SectionTitle>
          <DocumentForm
            departments={creatable.map((d) => ({ id: d.id, name: d.name }))}
            canApprove={canApprove}
          />
        </Card>
      ) : null}
    </div>
  );
}
