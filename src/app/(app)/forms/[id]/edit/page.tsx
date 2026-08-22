import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { FormBuilder } from "@/components/form-builder";
import { PageHeader } from "@/components/ui";
import { parseDefinition } from "@/lib/forms-schema";

export const metadata: Metadata = { title: "Edit form" };
export const dynamic = "force-dynamic";

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;

  const form = await db.form.findUnique({ where: { id } });
  if (!form || form.deletedAt || form.type !== "internal") notFound();

  if (!can(viewer, "update", { kind: "form", departmentId: form.departmentId, ownerId: form.ownerId })) {
    notFound();
  }

  const departments = await db.department.findMany({ orderBy: { sortOrder: "asc" } });
  const selectable = departments.filter(
    (d) =>
      d.id === form.departmentId ||
      can(viewer, "create", { kind: "form", departmentId: d.id, ownerId: viewer.id }),
  );

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Forms"
        title="Edit form"
        subtitle="Answers already submitted are kept. Removing a question hides it from the table but does not delete what people said."
        action={
          <Link href={`/forms/${form.id}`} className="hs-btn hs-btn-ghost">
            Cancel
          </Link>
        }
      />
      <FormBuilder
        departments={selectable.map((d) => ({ id: d.id, name: d.name }))}
        form={{
          id: form.id,
          title: form.title,
          description: form.description,
          departmentId: form.departmentId,
          deadline: form.deadline,
          isOpen: form.isOpen,
          definition: parseDefinition(form.schema),
        }}
      />
    </div>
  );
}
