import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/authorize";
import { Avatar, ProgressBar } from "@/components/ui";

export const metadata: Metadata = { title: "Teams & departments" };
export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const viewer = await requireViewer();

  const departments = await db.department.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      head: { select: { id: true, name: true, nickname: true, avatarUrl: true } },
      _count: {
        select: {
          members: { where: { deletedAt: null } },
          assignments: { where: { deletedAt: null } },
          documents: { where: { deletedAt: null } },
        },
      },
    },
  });

  const done = await db.assignment.groupBy({
    by: ["departmentId"],
    where: { deletedAt: null, status: { in: ["DONE", "APPROVED"] } },
    _count: { _all: true },
  });
  const doneMap = new Map(done.map((d) => [d.departmentId, d._count._all]));

  const ordered = [...departments].sort((a, b) => Number(b.id === viewer.departmentId) - Number(a.id === viewer.departmentId));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="hs-h1">Teams & departments</h1>
        <p className="mt-2 text-sm text-muted">Open a team workspace for its tasks, updates, files, and people.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {ordered.map((d) => {
          const total = d._count.assignments;
          const complete = doneMap.get(d.id) ?? 0;
          const mine = viewer.departmentId === d.id;

          return (
            <Link
              key={d.id}
              href={`/departments/${d.slug}`}
              className={`hs-card p-5 transition hover:border-brand ${
                mine ? "ring-1 ring-pink-200" : ""
              }`}
            >
              <span className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: d.color }}
                  aria-hidden="true"
                />
                <span className="hs-h2">{d.name}</span>
                {mine ? (
                  <span className="hs-pill bg-tint-strong text-brand-deep">My team</span>
                ) : null}
              </span>

              {d.description ? (
                <span className="mb-3 block text-sm text-muted">{d.description}</span>
              ) : null}

              <ProgressBar
                value={total === 0 ? 0 : (complete / total) * 100}
                label={`${complete}/${total} tasks done`}
              />

              <span className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-faint">
                <span>
                  {d._count.members} people · {d._count.documents} documents
                </span>
                {d.head ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar
                      name={d.head.name}
                      nickname={d.head.nickname}
                      url={d.head.avatarUrl}
                      size={20}
                    />
                    {d.head.nickname || d.head.name}
                  </span>
                ) : (
                  <span>Team lead not assigned</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
