import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { FormRecordForm } from "@/components/content-forms";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { formatDateLong } from "@/lib/dates";

export const metadata: Metadata = { title: "Forms" };
export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const viewer = await requireViewer();

  const [forms, departments] = await Promise.all([
    db.form.findMany({
      where: { deletedAt: null },
      include: {
        owner: { select: { name: true, nickname: true } },
        department: { select: { name: true, color: true } },
        _count: { select: { responses: true } },
      },
      orderBy: [{ isOpen: "desc" }, { deadline: "asc" }],
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const external = forms.filter((f) => f.type === "external");
  const internal = forms.filter((f) => f.type === "internal");

  const creatable = departments.filter((d) =>
    can(viewer, "create", { kind: "form", departmentId: d.id, ownerId: viewer.id }),
  );
  const canCreatePortalWide = can(viewer, "create", {
    kind: "form",
    departmentId: null,
    ownerId: viewer.id,
  });

  const section = (title: string, blurb: string, list: typeof forms) => (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <p className="mb-4 -mt-2 text-sm text-muted">{blurb}</p>
      {list.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <ul className="space-y-2.5">
          {list.map((f) => {
            const overdue = f.deadline && f.deadline.getTime() < Date.now();
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f3e3ec] p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">{f.title}</p>
                  {f.description ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">{f.description}</p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                    {f.department ? (
                      <span className="flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: f.department.color }}
                        />
                        {f.department.name}
                      </span>
                    ) : (
                      <span>Portal-wide</span>
                    )}
                    <span>· {f.owner.nickname || f.owner.name}</span>
                    {f.deadline ? (
                      <span className={overdue ? "font-semibold text-red-600" : ""}>
                        · closes {formatDateLong(f.deadline)}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="hs-pill bg-pink-50 text-pink-700">
                    {f.type === "internal" ? f._count.responses : f.responseCount} responses
                  </span>
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hs-btn hs-btn-secondary px-3 py-1.5 text-xs"
                    >
                      Open ↗
                    </a>
                  ) : null}
                  {f.responseUrl ? (
                    <a
                      href={f.responseUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hs-btn hs-btn-ghost px-3 py-1.5 text-xs"
                    >
                      Responses ↗
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="space-y-5">
      <header>
        <p className="hs-eyebrow">Forms hub</p>
        <h1 className="hs-h1">Every form, one place</h1>
      </header>

      {section(
        "External forms",
        "Recruitment, team registration, project submission — these stay in Google Forms. The portal tracks the link, the owner, the deadline and where the responses land.",
        external,
      )}

      {section(
        "Internal forms",
        "Availability, shirt sizes, event-day check-in, feedback. Defined by an admin; responses land in the portal.",
        internal,
      )}

      {creatable.length > 0 || canCreatePortalWide ? (
        <Card>
          <SectionTitle>Add a form</SectionTitle>
          <FormRecordForm departments={creatable.map((d) => ({ id: d.id, name: d.name }))} />
        </Card>
      ) : null}
    </div>
  );
}
