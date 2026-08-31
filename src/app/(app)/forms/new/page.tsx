import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { FormBuilder } from "@/components/form-builder";
import { FormRecordForm } from "@/components/content-forms";
import { Card, PageHeader, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "New form" };
export const dynamic = "force-dynamic";

export default async function NewFormPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const viewer = await requireViewer();
  const { kind } = await searchParams;
  const external = kind === "external";

  const departments = await db.department.findMany({ orderBy: { sortOrder: "asc" } });

  const creatable = departments.filter((d) =>
    can(viewer, "create", { kind: "form", departmentId: d.id, ownerId: viewer.id }),
  );
  const portalWide = can(viewer, "create", {
    kind: "form",
    departmentId: null,
    ownerId: viewer.id,
  });

  if (creatable.length === 0 && !portalWide) {
    return (
      <div className="hs-enter space-y-4">
        <PageHeader eyebrow="Forms" title="Only heads and admins build forms" />
        <p className="text-sm text-muted">
          A form collects answers from the whole team, so making one is a head's call. Ask yours.
        </p>
        <Link href="/forms" className="hs-btn hs-btn-secondary">
          Back to forms
        </Link>
      </div>
    );
  }

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Forms"
        title={external ? "Track an external form" : "Build a form"}
        subtitle={
          external
            ? "For a Google Form that already exists. The portal keeps the link, the owner and the deadline."
            : "Questions, answers and responses, all inside the portal. Nothing leaves for Google."
        }
        action={
          <Link href="/forms" className="hs-btn hs-btn-ghost">
            Cancel
          </Link>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/forms/new"
          aria-current={!external ? "page" : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            !external ? "bg-brand-solid text-on-brand" : "bg-surface text-muted hover:text-brand-deep"
          }`}
        >
          Build it here
        </Link>
        <Link
          href="/forms/new?kind=external"
          aria-current={external ? "page" : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            external ? "bg-brand-solid text-on-brand" : "bg-surface text-muted hover:text-brand-deep"
          }`}
        >
          Link a Google Form
        </Link>
      </div>

      {external ? (
        <Card>
          <SectionTitle>External form</SectionTitle>
          <FormRecordForm departments={creatable.map((d) => ({ id: d.id, name: d.name }))} />
        </Card>
      ) : (
        <FormBuilder departments={creatable.map((d) => ({ id: d.id, name: d.name }))} />
      )}
    </div>
  );
}
