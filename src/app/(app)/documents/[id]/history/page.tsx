import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { restoreDocumentRevision } from "@/lib/actions/content";
import { wordCount } from "@/lib/markdown";
import { formatDateLong } from "@/lib/dates";
import { Avatar, Card, DocStatusPill, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { RestoreButton } from "@/components/restore-button";

export const metadata: Metadata = { title: "Document history" };
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  edit: "replaced by an edit",
  restore: "replaced by a restore",
};

/**
 * Every version this document has had, newest first.
 *
 * The point of the page is the sentence at the top of it: an edit here never
 * destroys what was there before, so nobody has to be careful in the way people
 * are careful with a shared Google Doc at 1am.
 */
export default async function DocumentHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;

  const document = await db.document.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      version: true,
      status: true,
      body: true,
      source: true,
      updatedAt: true,
      deletedAt: true,
      departmentId: true,
      ownerId: true,
      department: { select: { name: true } },
    },
  });

  if (!document || document.deletedAt) notFound();

  const resource = {
    kind: "document" as const,
    departmentId: document.departmentId,
    ownerId: document.ownerId,
  };
  if (!can(viewer, "read", resource)) notFound();

  const restorable = can(viewer, "update", resource);

  const revisions = await db.documentRevision.findMany({
    where: { documentId: id },
    orderBy: { version: "desc" },
    take: 50,
  });

  const editors = await db.user.findMany({
    where: { id: { in: [...new Set(revisions.map((r) => r.editedById).filter(Boolean))] as string[] } },
    select: { id: true, name: true, nickname: true, avatarUrl: true },
  });
  const byId = new Map(editors.map((u) => [u.id, u]));

  return (
    <div className="hs-enter space-y-5">
      <Link href={`/documents/${id}`} className="text-sm font-semibold text-pink-600">
        ← Back to the document
      </Link>

      <PageHeader
        eyebrow={document.department.name}
        title={`History of “${document.title}”`}
        subtitle="Every save keeps what was there before. Nothing here was lost — it was replaced, and it can be put back."
      />

      <Card>
        <SectionTitle>Now — version {document.version}</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <DocStatusPill status={document.status} />
          <span className="text-xs text-faint">
            saved {formatDateLong(document.updatedAt)}
            {document.source === "portal" ? ` · ${wordCount(document.body ?? "")} words` : ""}
          </span>
        </div>
      </Card>

      {revisions.length === 0 ? (
        <EmptyState
          title="No earlier versions yet"
          hint="The first edit to this document files the current text here."
        />
      ) : (
        <ul className="space-y-3">
          {revisions.map((r) => {
            const editor = r.editedById ? byId.get(r.editedById) : undefined;

            return (
              <li key={r.id} className="hs-card space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">
                      Version {r.version} · {r.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                      {editor ? (
                        <>
                          <Avatar
                            name={editor.name}
                            nickname={editor.nickname}
                            url={editor.avatarUrl}
                            size={18}
                          />
                          {editor.nickname || editor.name} ·{" "}
                        </>
                      ) : null}
                      {REASONS[r.reason] ?? r.reason} · {formatDateLong(r.createdAt)}
                      {r.source === "portal" ? ` · ${wordCount(r.body ?? "")} words` : ""}
                    </p>
                  </div>
                  {restorable ? (
                    <RestoreButton
                      action={async () => {
                        "use server";
                        await restoreDocumentRevision(r.id);
                      }}
                      title={`Restore version ${r.version}?`}
                      body="The current text is kept as a new version first, so this can be undone."
                      label={`Restore v${r.version}`}
                    />
                  ) : null}
                </div>

                {r.source === "portal" && r.body ? (
                  <details className="rounded-xl border border-line bg-white/60 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted">
                      Show what it said
                    </summary>
                    {/* Plain text, deliberately: this is the raw Markdown as it
                        was typed, and rendering it here would run a version
                        nobody has reviewed. */}
                    <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-ink">
                      {r.body}
                    </pre>
                  </details>
                ) : r.externalUrl ? (
                  <p className="truncate text-xs text-muted">Linked: {r.externalUrl}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
