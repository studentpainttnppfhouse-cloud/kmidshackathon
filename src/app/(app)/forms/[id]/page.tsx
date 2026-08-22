import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { deleteFormResponse, setFormOpen } from "@/lib/actions/forms";
import { answerText, parseDefinition, type ResponsePayload } from "@/lib/forms-schema";
import { FormFill } from "@/components/form-fill";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Avatar, Banner, Card, EmptyState, LastUpdated, PageHeader, SectionTitle } from "@/components/ui";
import { formatDateLong, formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Form" };
export const dynamic = "force-dynamic";

export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;

  const form = await db.form.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, nickname: true } },
      department: { select: { name: true, color: true } },
    },
  });

  if (!form || form.deletedAt) notFound();

  const resource = { kind: "form" as const, departmentId: form.departmentId, ownerId: form.ownerId };
  if (!can(viewer, "read", resource)) notFound();

  const manages = can(viewer, "update", resource);
  const definition = parseDefinition(form.schema);

  // Responses are other people's answers. Only whoever runs the form sees the
  // table; everybody else sees their own submission and nothing more.
  const responses = await db.formResponse.findMany({
    where: manages ? { formId: form.id } : { formId: form.id, userId: viewer.id },
    include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
    orderBy: { submittedAt: "desc" },
    take: manages ? 500 : 1,
  });

  const mine = responses.find((r) => r.userId === viewer.id);
  const closed = !form.isOpen || (form.deadline !== null && form.deadline.getTime() < Date.now());

  return (
    <div className="hs-enter space-y-5">
      <Link href="/forms" className="hs-no-print text-sm font-semibold text-pink-600">
        ← All forms
      </Link>

      <PageHeader
        eyebrow={form.department?.name ?? "Portal-wide"}
        title={form.title}
        subtitle={form.description ?? undefined}
        action={
          manages && form.type === "internal" ? (
            <>
              <Link href={`/forms/${form.id}/edit`} className="hs-btn hs-btn-secondary">
                Edit questions
              </Link>
              <form
                action={async () => {
                  "use server";
                  await setFormOpen(form.id, !form.isOpen);
                }}
              >
                <button type="submit" className="hs-btn hs-btn-ghost">
                  {form.isOpen ? "Close the form" : "Reopen"}
                </button>
              </form>
            </>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className={`hs-pill ${closed ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>
          {closed ? "Closed" : "Open"}
        </span>
        {form.deadline ? (
          <span className="hs-pill bg-amber-50 text-amber-700">
            Closes {formatDateLong(form.deadline)}
          </span>
        ) : null}
        {manages ? (
          <span className="hs-pill bg-pink-50 text-pink-700">
            {responses.length} {responses.length === 1 ? "response" : "responses"}
          </span>
        ) : null}
      </div>

      {form.type !== "internal" ? (
        <Banner tone="info">
          This is an external form — the questions and the answers live in Google. Open it from the
          forms index.
        </Banner>
      ) : !definition ? (
        <Banner tone="warn">
          This form has no questions saved. {manages ? "Edit it to add some." : "Ask its owner to finish it."}
        </Banner>
      ) : closed ? (
        <Card>
          <SectionTitle>Not accepting answers</SectionTitle>
          <p className="text-sm text-muted">
            {form.deadline && form.deadline.getTime() < Date.now()
              ? `The deadline passed on ${formatDateLong(form.deadline)}.`
              : "The person running this form has closed it."}
          </p>
          {mine ? (
            <div className="mt-4">
              <h3 className="hs-eyebrow mb-2">What you answered</h3>
              <AnswerList
                definition={definition}
                payload={mine.payload as ResponsePayload}
              />
            </div>
          ) : null}
        </Card>
      ) : (
        <FormFill
          formId={form.id}
          definition={definition}
          existing={mine ? (mine.payload as ResponsePayload) : null}
        />
      )}

      {manages && definition && form.type === "internal" ? (
        <Card>
          <SectionTitle
            action={
              <span className="text-xs text-faint">
                Visible to you as the form owner, and to admins.
              </span>
            }
          >
            Responses
          </SectionTitle>

          {responses.length === 0 ? (
            <EmptyState title="Nobody has answered yet" hint="Share the link and check back." />
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="hs-eyebrow px-2 py-2">
                      Who
                    </th>
                    {definition.questions.map((question) => (
                      <th key={question.id} scope="col" className="hs-eyebrow px-2 py-2">
                        {question.label}
                      </th>
                    ))}
                    <th scope="col" className="hs-eyebrow px-2 py-2">
                      When
                    </th>
                    <th scope="col" className="sr-only">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((response) => (
                    <tr key={response.id} className="border-b border-line last:border-0">
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2">
                          <Avatar
                            name={response.user?.name ?? "Unknown"}
                            nickname={response.user?.nickname}
                            url={response.user?.avatarUrl}
                            size={22}
                          />
                          <span className="truncate">
                            {response.user?.nickname || response.user?.name || "Unknown"}
                          </span>
                        </span>
                      </td>
                      {definition.questions.map((question) => (
                        <td key={question.id} className="px-2 py-2.5 align-top text-muted">
                          {answerText(response.payload as ResponsePayload, question) || "—"}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-2 py-2.5 text-xs text-faint">
                        {formatDateTime(response.submittedAt)}
                      </td>
                      <td className="px-2 py-2.5">
                        <ConfirmDelete
                          action={async () => {
                            "use server";
                            await deleteFormResponse(response.id);
                          }}
                          label="Remove"
                          title="Remove this response?"
                          body="It is deleted for good — responses are not soft-deleted."
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-faint">
        <span>Run by {form.owner.nickname || form.owner.name}</span>
        <LastUpdated at={form.updatedAt} />
      </div>
    </div>
  );
}

function AnswerList({
  definition,
  payload,
}: {
  definition: NonNullable<ReturnType<typeof parseDefinition>>;
  payload: ResponsePayload;
}) {
  return (
    <dl className="space-y-2 text-sm">
      {definition.questions.map((question) => (
        <div key={question.id}>
          <dt className="text-xs font-semibold text-faint">{question.label}</dt>
          <dd className="text-muted">{answerText(payload, question) || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
