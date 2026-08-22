import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { DocumentEditor } from "@/components/document-editor";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New document" };
export const dynamic = "force-dynamic";

/**
 * Creating a document is its own page, not a panel underneath the index.
 *
 * The index is a list of two hundred cards; a form at the bottom of it is a
 * form nobody scrolls to, and one that reflows the whole page when it opens.
 */
export default async function NewDocumentPage() {
  const viewer = await requireViewer();

  const [departments, assignments] = await Promise.all([
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
    db.assignment.findMany({
      where: { deletedAt: null, status: { notIn: ["DONE", "APPROVED"] } },
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

  const creatable = departments.filter((d) =>
    can(viewer, "create", { kind: "document", departmentId: d.id, ownerId: viewer.id }),
  );

  if (creatable.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Documents" title="You cannot add documents yet" />
        <p className="text-sm text-muted">
          Documents are filed into a department. Ask an admin to put your account in one.
        </p>
        <Link href="/documents" className="hs-btn hs-btn-secondary">
          Back to documents
        </Link>
      </div>
    );
  }

  const canApprove = creatable.some((d) =>
    can(viewer, "approve", { kind: "document", departmentId: d.id, ownerId: viewer.id }),
  );

  // Only tasks this person may edit can be attached — the same rule the server
  // action enforces, applied here so the dropdown never offers a choice that
  // would be refused on submit.
  const attachable = assignments
    .filter((a) =>
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
        title="New document"
        subtitle="Write it here and export it later, or point the portal at a Google Doc."
        action={
          <Link href="/documents" className="hs-btn hs-btn-ghost">
            Cancel
          </Link>
        }
      />
      <DocumentEditor
        departments={creatable.map((d) => ({ id: d.id, name: d.name }))}
        assignments={attachable}
        canApprove={canApprove}
      />
    </div>
  );
}
