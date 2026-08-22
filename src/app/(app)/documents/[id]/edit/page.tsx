import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { DocumentEditor } from "@/components/document-editor";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Edit document" };
export const dynamic = "force-dynamic";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;

  const document = await db.document.findUnique({ where: { id } });
  if (!document || document.deletedAt) notFound();

  const resource = {
    kind: "document" as const,
    departmentId: document.departmentId,
    ownerId: document.ownerId,
  };

  // Not a redirect to the read page: somebody who cannot edit this document
  // should not learn from the response that it is theirs to ask about.
  if (!can(viewer, "update", resource)) notFound();

  const [departments, assignments] = await Promise.all([
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
    db.assignment.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        departmentId: true,
        createdById: true,
        assignees: { select: { userId: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 200,
    }),
  ]);

  // The current department stays selectable even if this person could not
  // create there — otherwise editing a document a head filed for you would
  // silently move it.
  const selectable = departments.filter(
    (d) =>
      d.id === document.departmentId ||
      can(viewer, "create", { kind: "document", departmentId: d.id, ownerId: viewer.id }),
  );

  const canApprove = can(viewer, "approve", resource);

  const attachable = assignments
    .filter(
      (a) =>
        a.id === document.assignmentId ||
        can(viewer, "update", {
          kind: "assignment",
          departmentId: a.departmentId,
          createdById: a.createdById,
          ownerIds: a.assignees.map((x) => x.userId),
        }),
    )
    .map((a) => ({ id: a.id, title: a.title }));

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Documents"
        title="Edit document"
        action={
          <Link href={`/documents/${document.id}`} className="hs-btn hs-btn-ghost">
            Cancel
          </Link>
        }
      />
      <DocumentEditor
        departments={selectable.map((d) => ({ id: d.id, name: d.name }))}
        assignments={attachable}
        canApprove={canApprove}
        document={{
          id: document.id,
          title: document.title,
          description: document.description,
          departmentId: document.departmentId,
          source: document.source,
          externalUrl: document.externalUrl,
          body: document.body,
          assignmentId: document.assignmentId,
          status: document.status,
          tags: Array.isArray(document.tags) ? (document.tags as string[]) : [],
        }}
      />
    </div>
  );
}
