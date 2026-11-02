import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { isPublicForm, parseDefinition } from "@/lib/forms-schema";
import { MAX_UPLOAD_BYTES } from "@/lib/attachments";
import { FormFill } from "@/components/form-fill";
import { formatDateLong } from "@/lib/dates";

export const metadata: Metadata = { title: "Form · Hackathon Studio", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The share link for a portal form. Lives outside the (app) group so it needs
 * no account. Staff-only forms bounce into the portal (or to sign-in); public
 * forms are answered right here, email first.
 */
export default async function PublicFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();

  const form = await db.form.findFirst({
    where: { OR: [{ id }, { slug: id }], deletedAt: null, type: "internal" },
    select: { id: true, title: true, description: true, schema: true, isOpen: true, deadline: true },
  });
  if (!form) notFound();

  const definition = parseDefinition(form.schema);
  if (!isPublicForm(definition)) {
    if (viewer) redirect(`/forms/${form.id}`);
    redirect("/login");
  }
  if (!definition) notFound();

  const closed = !form.isOpen || (form.deadline !== null && form.deadline.getTime() < Date.now());

  return (
    <main className="min-h-screen bg-brand-wash px-4 py-8 sm:py-12">
      {closed ? (
        <div className="hs-card mx-auto max-w-2xl p-5 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">{form.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {form.deadline && form.deadline.getTime() < Date.now()
              ? `Not accepting answers. The deadline passed on ${formatDateLong(form.deadline)}.`
              : "Not accepting answers. The person running this form has closed it."}
          </p>
        </div>
      ) : (
        <FormFill
          formId={form.id}
          title={form.title}
          description={form.description}
          definition={definition}
          existing={null}
          maxBytes={MAX_UPLOAD_BYTES}
          askEmail
          lockedEmail={viewer?.email ?? null}
        />
      )}
      <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-faint">
        {form.deadline && !closed ? `Closes ${formatDateLong(form.deadline)} · ` : ""}
        KMIDS Hackathon Studio
        {viewer ? (
          <>
            {" · "}
            <Link href="/dashboard" className="text-brand-deep">
              Back to the portal
            </Link>
          </>
        ) : null}
      </p>
    </main>
  );
}
