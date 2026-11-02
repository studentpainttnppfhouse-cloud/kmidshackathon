import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { Card, EmptyState, PageHeader } from "@/components/ui";
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

  const visible = forms.filter((f) =>
    can(viewer, "read", { kind: "form", departmentId: f.departmentId, ownerId: f.ownerId }),
  );

  // Google Form links are no longer supported; old rows stay in the database
  // but are not listed.
  const internal = visible.filter((f) => f.type === "internal");

  const canCreate =
    can(viewer, "create", { kind: "form", departmentId: null, ownerId: viewer.id }) ||
    departments.some((d) =>
      can(viewer, "create", { kind: "form", departmentId: d.id, ownerId: viewer.id }),
    );

  const section = (list: typeof visible) => (
    <Card>

      {list.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <ul className="space-y-2.5">
          {list.map((form) => {
            const overdue = form.deadline && form.deadline.getTime() < Date.now();

            return (
              <li
                key={form.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3 transition hover:border-brand"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    <Link href={`/forms/${form.id}`} className="hover:text-brand-deep">
                      {form.title}
                    </Link>
                  </p>
                  {form.description ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">{form.description}</p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                    {form.department ? (
                      <span className="flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: form.department.color }}
                          aria-hidden="true"
                        />
                        {form.department.name}
                      </span>
                    ) : (
                      <span>Portal-wide</span>
                    )}
                    <span>· {form.owner.nickname || form.owner.name}</span>
                    {form.deadline ? (
                      <span className={overdue ? "font-semibold text-danger-strong" : ""}>
                        · closes {formatDateLong(form.deadline)}
                      </span>
                    ) : null}
                    {!form.isOpen ? <span>· closed</span> : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="hs-pill bg-tint text-brand-deep">
                    {form._count.responses} responses
                  </span>
                  <Link href={`/forms/${form.id}`} className="hs-btn hs-btn-secondary px-3 py-1.5 text-xs">
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Forms hub"
        title="Forms"
        action={
          canCreate ? (
            <Link href="/forms/new" className="hs-btn hs-btn-primary">
              <span aria-hidden="true">＋</span> New form
            </Link>
          ) : null
        }
      />

      {section(internal)}
    </div>
  );
}
