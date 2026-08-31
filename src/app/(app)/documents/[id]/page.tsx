import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { deleteDocument } from "@/lib/actions/content";
import { renderMarkdown, wordCount } from "@/lib/markdown";
import { safeHref } from "@/lib/url";
import { formatDateLong } from "@/lib/dates";
import { Avatar, Card, DocStatusPill, LastUpdated, PageHeader, SectionTitle } from "@/components/ui";
import { CopyButton } from "@/components/chrome";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Comments } from "@/components/comments";

export const metadata: Metadata = { title: "Document" };
export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;

  const document = await db.document.findUnique({
    where: { id },
    include: {
      department: { select: { name: true, color: true, slug: true } },
      owner: { select: { id: true, name: true, nickname: true, avatarUrl: true } },
    },
  });

  if (!document || document.deletedAt) notFound();

  const resource = {
    kind: "document" as const,
    departmentId: document.departmentId,
    ownerId: document.ownerId,
  };

  // The page is reachable by URL, so it decides for itself who may see it
  // rather than assuming the index already filtered.
  if (!can(viewer, "read", resource)) notFound();

  const editable = can(viewer, "update", resource);
  const deletable = can(viewer, "delete", resource);

  const [comments, attachedTask] = await Promise.all([
    db.comment.findMany({
      where: { parentType: "document", parentId: id, deletedAt: null },
      include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    document.assignmentId
      ? db.assignment.findUnique({
          where: { id: document.assignmentId },
          select: { id: true, title: true, status: true, deletedAt: true },
        })
      : Promise.resolve(null),
  ]);

  const isPortalDoc = document.source === "portal" && document.body !== null;
  const externalHref = safeHref(document.externalUrl);
  const tags = Array.isArray(document.tags) ? (document.tags as string[]) : [];

  return (
    <div className="hs-enter space-y-5">
      <Link href="/documents" className="hs-no-print text-sm font-semibold text-brand-deep">
        ← All documents
      </Link>

      <PageHeader
        eyebrow={document.department.name}
        title={document.title}
        subtitle={document.description ?? undefined}
        action={
          <>
            {isPortalDoc ? (
              <div className="hs-no-print flex flex-wrap gap-2">
                <a
                  href={`/documents/${document.id}/export?format=docx`}
                  className="hs-btn hs-btn-secondary"
                >
                  Word (.docx)
                </a>
                <a
                  href={`/documents/${document.id}/export?format=pdf`}
                  className="hs-btn hs-btn-secondary"
                >
                  PDF
                </a>
                <a
                  href={`/documents/${document.id}/export?format=md`}
                  className="hs-btn hs-btn-secondary"
                >
                  Markdown
                </a>
              </div>
            ) : externalHref ? (
              <a
                href={externalHref}
                target="_blank"
                rel="noreferrer noopener"
                className="hs-btn hs-btn-primary hs-no-print"
              >
                Open in Drive ↗
              </a>
            ) : null}

            {editable ? (
              <Link
                href={`/documents/${document.id}/edit`}
                className="hs-btn hs-btn-primary hs-no-print"
              >
                Edit
              </Link>
            ) : null}
          </>
        }
      />

      <div className="hs-no-print flex flex-wrap items-center gap-2">
        <DocStatusPill status={document.status} />
        <span className="hs-pill bg-tint text-brand-deep">
          {isPortalDoc ? "Written in the portal" : "Linked document"}
        </span>
        {tags.map((tag) => (
          <span key={tag} className="hs-pill bg-neutral-soft text-neutral-strong">
            {tag}
          </span>
        ))}
        {isPortalDoc ? (
          <span className="text-xs text-faint">{wordCount(document.body ?? "")} words</span>
        ) : null}
      </div>

      {attachedTask && !attachedTask.deletedAt ? (
        <div className="hs-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted">
            Submitted for{" "}
            <Link
              href={`/assignments/${attachedTask.id}`}
              className="font-semibold text-brand-deep hover:underline"
            >
              {attachedTask.title}
            </Link>
          </p>
          <span className="hs-pill bg-tint text-brand-deep">
            {attachedTask.status.replace(/_/g, " ").toLowerCase()}
          </span>
        </div>
      ) : null}

      {isPortalDoc ? (
        <article className="hs-card p-6 sm:p-8">
          <div
            className="hs-prose"
            // Output of src/lib/markdown.ts, which HTML-escapes the author's
            // text before interpreting any Markdown. See that file's header.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(document.body ?? "") }}
          />
        </article>
      ) : externalHref ? (
        <Card>
          <SectionTitle>Where this lives</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            The content is in Google Drive. The portal keeps the title, the owner, the status and
            the search index.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={externalHref}
              target="_blank"
              rel="noreferrer noopener"
              className="hs-btn hs-btn-primary"
            >
              Open document ↗
            </a>
            <CopyButton value={externalHref} label="Copy link" />
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted">
            This document has neither a body nor a link. Edit it to add one.
          </p>
        </Card>
      )}

      <div className="hs-no-print flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex items-center gap-2 text-xs text-faint">
          <Avatar
            name={document.owner.name}
            nickname={document.owner.nickname}
            url={document.owner.avatarUrl}
            size={22}
          />
          <Link href={`/people/${document.owner.id}`} className="hover:text-brand-deep">
            {document.owner.nickname || document.owner.name}
          </Link>
          · created {formatDateLong(document.createdAt)}
        </span>
        <LastUpdated at={document.updatedAt} />
      </div>

      {deletable ? (
        <div className="hs-no-print">
          <ConfirmDelete
            action={async () => {
              "use server";
              await deleteDocument(id);
            }}
            label="Delete this document"
            title="Delete this document?"
            body="It moves to the recycle bin. An admin can restore it from the admin panel."
            className="hs-btn hs-btn-danger"
          />
        </div>
      ) : null}

      <div className="hs-no-print">
        <Card>
          <SectionTitle>Comments</SectionTitle>
          <Comments
            parentType="document"
            parentId={id}
            viewerId={viewer.id}
            comments={comments.map((c) => ({
              id: c.id,
              body: c.body,
              createdAt: c.createdAt,
              user: c.user,
            }))}
          />
        </Card>
      </div>
    </div>
  );
}
