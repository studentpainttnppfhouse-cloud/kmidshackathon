import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/authorize";
import { Avatar, ProgressBar } from "@/components/ui";

export const metadata: Metadata = { title: "Departments" };
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

  return (
    <div className="space-y-5">
      <header>
        <p className="hs-eyebrow">Workspaces</p>
        <h1 className="hs-h1">Six departments, one shared view</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {departments.map((d) => {
          const total = d._count.assignments;
          const complete = doneMap.get(d.id) ?? 0;
          const mine = viewer.departmentId === d.id;

          return (
            <Link
              key={d.id}
              href={`/departments/${d.slug}`}
              className={`hs-card p-5 transition hover:border-pink-300 ${
                mine ? "ring-1 ring-pink-200" : ""
              }`}
            >
              <span className="mb-2 flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: d.color }}
                  aria-hidden="true"
                />
                <span className="hs-h2">{d.name}</span>
                {mine ? (
                  <span className="hs-pill bg-pink-100 text-pink-700">Yours</span>
                ) : null}
              </span>

              {d.description ? (
                <span className="mb-3 block text-sm text-muted">{d.description}</span>
              ) : null}

              <ProgressBar
                value={total === 0 ? 0 : (complete / total) * 100}
                label={`${complete}/${total} tasks done`}
              />

              <span className="mt-3 flex items-center justify-between text-xs text-faint">
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
                  <span>No head</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
