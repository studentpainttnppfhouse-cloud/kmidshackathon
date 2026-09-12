import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, isAdmin } from "@/lib/authorize";
import { EVENT_START } from "@/lib/constants";
import { endOfWeek, timeAgo } from "@/lib/dates";
import { Countdown } from "@/components/countdown";
import { AssignmentRow, type AssignmentSummary } from "@/components/assignment-row";
import { Avatar, Banner, Card, EmptyState, ProgressBar, SectionTitle, Stat, ZineHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const assignmentInclude = {
  department: { select: { name: true, color: true, slug: true } },
  assignees: {
    select: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
  },
} as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const viewer = await requireViewer();
  const { denied } = await searchParams;

  const isHead = viewer.tier === "T2_HEAD";
  const admin = isAdmin(viewer);
  const deptId = viewer.departmentId;

  const [myThisWeek, announcements, deptStats] = await Promise.all([
    db.assignment.findMany({
      where: {
        deletedAt: null,
        assignees: { some: { userId: viewer.id } },
        status: { notIn: ["DONE", "APPROVED"] },
        OR: [{ dueDate: { lte: endOfWeek() } }, { dueDate: null }],
      },
      include: assignmentInclude,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 8,
    }),
    db.announcement.findMany({
      where: {
        deletedAt: null,
        OR: [{ scope: "all" }, { departmentId: deptId ?? "__none__" }],
      },
      include: { author: { select: { name: true, nickname: true, avatarUrl: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 4,
    }),
    db.department.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        _count: { select: { assignments: { where: { deletedAt: null } } } },
      },
    }),
  ]);

  // Completion per department, computed in one grouped query rather than N.
  const doneCounts = await db.assignment.groupBy({
    by: ["departmentId"],
    where: { deletedAt: null, status: { in: ["DONE", "APPROVED"] } },
    _count: { _all: true },
  });
  const doneMap = new Map(doneCounts.map((d) => [d.departmentId, d._count._all]));

  const totalTasks = deptStats.reduce((sum, d) => sum + d._count.assignments, 0);
  const totalDone = deptStats.reduce((sum, d) => sum + (doneMap.get(d.id) ?? 0), 0);

  const [overdueCount, needsReviewCount, recent] = await Promise.all([
    db.assignment.count({
      where: {
        deletedAt: null,
        dueDate: { lt: new Date() },
        status: { notIn: ["DONE", "APPROVED"] },
        ...(admin ? {} : { departmentId: deptId ?? "__none__" }),
      },
    }),
    db.assignment.count({
      where: {
        deletedAt: null,
        status: "NEEDS_REVIEW",
        ...(admin ? {} : { departmentId: deptId ?? "__none__" }),
      },
    }),
    admin || isHead
      ? db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          include: { user: { select: { name: true, nickname: true, avatarUrl: true } } },
        })
      : Promise.resolve([]),
  ]);

  const greeting = viewer.nickname || viewer.name.split(" ")[0];

  return (
    <div className="space-y-6">
      {denied ? (
        <Banner tone="warn">
          {denied === "page"
            ? "That page is switched off for your tier. An owner can turn it back on from Admin → Page access."
            : "That area needs a higher permission tier than your account has."}
        </Banner>
      ) : null}

      <ZineHeader
        eyebrow="Dashboard"
        title={`Hi, ${greeting}`}
        action={
          <Link href="/assignments?view=mine" className="hs-btn hs-btn-secondary">
            My tasks
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="My open tasks" value={myThisWeek.length} href="/assignments?view=mine" />
            <Stat
              label="Overdue"
              value={overdueCount}
              tone={overdueCount > 0 ? "danger" : "ok"}
              href="/assignments?view=list&status=overdue"
            />
            <Stat
              label="Needs review"
              value={needsReviewCount}
              tone={needsReviewCount > 0 ? "warn" : "default"}
              href="/assignments?view=board"
            />
            <Stat label="Tasks total" value={totalTasks} href="/assignments" />
          </div>
        </div>
        <Countdown targetIso={EVENT_START.toISOString()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle
            action={
              <Link href="/assignments?view=mine" className="text-sm font-semibold text-brand-deep">
                See all
              </Link>
            }
          >
            My assignments this week
          </SectionTitle>

          {myThisWeek.length === 0 ? (
            <EmptyState
              title="Nothing due this week"
              hint="When a head assigns you something it lands here."
            />
          ) : (
            <div className="-mx-1 space-y-0.5">
              {myThisWeek.map((a) => (
                <AssignmentRow key={a.id} a={a as AssignmentSummary} />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            action={
              <Link href="/announcements" className="text-sm font-semibold text-brand-deep">
                All
              </Link>
            }
          >
            Announcements
          </SectionTitle>

          {announcements.length === 0 ? (
            <EmptyState title="No announcements yet" />
          ) : (
            <ul className="space-y-3">
              {announcements.map((n) => (
                <li key={n.id} className="border-b border-line-soft pb-3 last:border-0 last:pb-0">
                  <Link href="/announcements" className="block">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      {n.pinned ? <span aria-label="Pinned">📌</span> : null}
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                      <Avatar
                        name={n.author.name}
                        nickname={n.author.nickname}
                        url={n.author.avatarUrl}
                        size={16}
                      />
                      {n.author.nickname || n.author.name} · {timeAgo(n.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {admin || isHead ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionTitle>
              {admin ? "All departments at a glance" : "Department progress"}
            </SectionTitle>
            <div className="space-y-4">
              <ProgressBar
                value={totalTasks === 0 ? 0 : (totalDone / totalTasks) * 100}
                label="Overall completion"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {deptStats
                  .filter((d) => admin || d.id === deptId)
                  .map((d) => {
                    const total = d._count.assignments;
                    const done = doneMap.get(d.id) ?? 0;
                    return (
                      <Link
                        key={d.id}
                        href={`/departments/${d.slug}`}
                        className="rounded-xl border border-line p-3 transition hover:border-brand"
                      >
                        <span className="mb-1.5 flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: d.color }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm font-semibold text-ink">{d.name}</span>
                        </span>
                        <ProgressBar
                          value={total === 0 ? 0 : (done / total) * 100}
                          label={`${done}/${total} done`}
                        />
                      </Link>
                    );
                  })}
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle>Live activity</SectionTitle>
            {recent.length === 0 ? (
              <EmptyState title="Quiet so far" />
            ) : (
              <ul className="space-y-2.5 text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/50" />
                    <span className="min-w-0">
                      <span className="font-medium text-ink">
                        {r.user?.nickname || r.user?.name || "System"}
                      </span>{" "}
                      <span className="text-muted">{r.action.replace(/[._]/g, " ")}</span>
                      <span className="block text-[11px] text-faint">{timeAgo(r.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
