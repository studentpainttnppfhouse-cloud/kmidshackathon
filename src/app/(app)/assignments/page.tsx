import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { PageHeader } from "@/components/ui";
import { BoardView, CalendarView, ListView } from "./views";
import type { AssignmentSummary } from "@/components/assignment-row";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";

const VIEWS = ["board", "list", "calendar", "mine"] as const;
type View = (typeof VIEWS)[number];

const include = {
  department: { select: { name: true, color: true, slug: true } },
  assignees: {
    select: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
  },
} as const;

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; dept?: string; status?: string; month?: string }>;
}) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "board";

  const where: Prisma.AssignmentWhereInput = { deletedAt: null };

  if (view === "mine") {
    where.assignees = { some: { userId: viewer.id } };
  }
  if (sp.dept) {
    where.department = { slug: sp.dept };
  }
  if (sp.status === "overdue") {
    where.dueDate = { lt: new Date() };
    where.status = { notIn: ["DONE", "APPROVED"] };
  }

  const [items, departments] = await Promise.all([
    db.assignment.findMany({
      where,
      include,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 400,
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  // Even a read-mostly portal filters its lists through the policy rather than
  // trusting the query: `can()` is the single place the rules live, and a page
  // that skips it is a page that will not follow the rules when they change.
  const summaries = items.filter((a) =>
    can(viewer, "read", {
      kind: "assignment",
      departmentId: a.departmentId,
      createdById: a.createdById,
      ownerIds: a.assignees.map((x) => x.user.id),
    }),
  ) as AssignmentSummary[];

  // Which departments may this person file a task into?
  const creatable = departments.filter((d) =>
    can(viewer, "create", {
      kind: "assignment",
      departmentId: d.id,
      createdById: viewer.id,
      ownerIds: [viewer.id],
    }),
  );

  const month = sp.month ? new Date(`${sp.month}-01T00:00:00+07:00`) : new Date();

  const tab = (v: View, label: string) => {
    const params = new URLSearchParams();
    params.set("view", v);
    if (sp.dept) params.set("dept", sp.dept);
    return (
      <Link
        key={v}
        href={`/assignments?${params}`}
        aria-current={view === v ? "page" : undefined}
        className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
          view === v ? "bg-brand-solid text-on-brand" : "bg-surface text-muted hover:text-brand-deep"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Assignments"
        title={view === "mine" ? "My tasks" : "Everything the team owes"}
        action={
          creatable.length > 0 ? (
            <Link
              href={sp.dept ? `/assignments/new?dept=${encodeURIComponent(sp.dept)}` : "/assignments/new"}
              className="hs-btn hs-btn-primary"
            >
              <span aria-hidden="true">＋</span> New task
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="How to view the tasks">
        {tab("board", "Board")}
        {tab("list", "List")}
        {tab("calendar", "Calendar")}
        {tab("mine", "My tasks")}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href={`/assignments?view=${view}`}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            !sp.dept ? "bg-tint-strong text-brand-deep" : "bg-surface text-muted hover:text-brand-deep"
          }`}
        >
          All departments
        </Link>
        {departments.map((d) => (
          <Link
            key={d.id}
            href={`/assignments?view=${view}&dept=${d.slug}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              sp.dept === d.slug ? "bg-tint-strong text-brand-deep" : "bg-surface text-muted hover:text-brand-deep"
            }`}
          >
            {d.name}
          </Link>
        ))}
      </div>

      {view === "board" ? <BoardView items={summaries} /> : null}
      {view === "list" || view === "mine" ? <ListView items={summaries} /> : null}
      {view === "calendar" ? <CalendarView items={summaries} month={month} /> : null}

    </div>
  );
}
