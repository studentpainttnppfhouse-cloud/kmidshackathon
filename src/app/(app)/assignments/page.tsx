import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, isAdmin, can } from "@/lib/authorize";
import { Card, SectionTitle } from "@/components/ui";
import { AssignmentForm } from "@/components/assignment-form";
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

  const [items, departments, people] = await Promise.all([
    db.assignment.findMany({
      where,
      include,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 400,
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
    db.user.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, nickname: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const summaries = items as AssignmentSummary[];

  // Which departments may this person file a task into?
  const creatable = departments.filter((d) =>
    can(viewer, "create", {
      kind: "assignment",
      departmentId: d.id,
      createdById: viewer.id,
      ownerIds: [viewer.id],
    }),
  );

  const canAssignOthers =
    isAdmin(viewer) ||
    departments.some((d) =>
      can(viewer, "assign", {
        kind: "assignment",
        departmentId: d.id,
        createdById: viewer.id,
        ownerIds: [],
      }),
    );

  const canApprove = canAssignOthers;

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
          view === v ? "bg-brand text-white" : "bg-white text-muted hover:text-pink-700"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hs-eyebrow">Assignments</p>
          <h1 className="hs-h1">
            {view === "mine" ? "My tasks" : "Everything the team owes"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tab("board", "Board")}
          {tab("list", "List")}
          {tab("calendar", "Calendar")}
          {tab("mine", "My tasks")}
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href={`/assignments?view=${view}`}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            !sp.dept ? "bg-pink-100 text-pink-700" : "bg-white text-muted"
          }`}
        >
          All departments
        </Link>
        {departments.map((d) => (
          <Link
            key={d.id}
            href={`/assignments?view=${view}&dept=${d.slug}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              sp.dept === d.slug ? "bg-pink-100 text-pink-700" : "bg-white text-muted"
            }`}
          >
            {d.name}
          </Link>
        ))}
      </div>

      {view === "board" ? <BoardView items={summaries} /> : null}
      {view === "list" || view === "mine" ? <ListView items={summaries} /> : null}
      {view === "calendar" ? <CalendarView items={summaries} month={month} /> : null}

      {creatable.length > 0 ? (
        <Card>
          <SectionTitle>New task</SectionTitle>
          <AssignmentForm
            departments={creatable.map((d) => ({ id: d.id, name: d.name }))}
            people={canAssignOthers ? people : [{ id: viewer.id, name: viewer.name, nickname: viewer.nickname }]}
            canAssignOthers={canAssignOthers}
            canApprove={canApprove}
          />
        </Card>
      ) : null}
    </div>
  );
}
