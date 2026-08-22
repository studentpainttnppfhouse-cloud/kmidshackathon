import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/authorize";
import { AssignmentRow, type AssignmentSummary } from "@/components/assignment-row";
import {
  Avatar,
  Card,
  DocStatusPill,
  EmptyState,
  ProgressBar,
  SectionTitle,
  Stat,
  TierPill,
} from "@/components/ui";
import { timeAgo } from "@/lib/dates";
import { assetLinkProps, isStored } from "@/lib/assets";

export const metadata: Metadata = { title: "Department" };
export const dynamic = "force-dynamic";

export default async function DepartmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const viewer = await requireViewer();
  const { slug } = await params;

  const d = await db.department.findUnique({
    where: { slug },
    include: {
      head: { select: { id: true, name: true, nickname: true, avatarUrl: true } },
      members: {
        where: { deletedAt: null },
        select: { id: true, name: true, nickname: true, avatarUrl: true, roleTitle: true, tier: true },
        orderBy: [{ tier: "desc" }, { name: "asc" }],
      },
    },
  });

  if (!d) notFound();

  const [assignments, documents, files, announcements] = await Promise.all([
    db.assignment.findMany({
      where: { departmentId: d.id, deletedAt: null },
      include: {
        department: { select: { name: true, color: true, slug: true } },
        assignees: {
          select: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 20,
    }),
    db.document.findMany({
      where: { departmentId: d.id, deletedAt: null },
      include: { owner: { select: { name: true, nickname: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    db.fileAsset.findMany({
      where: { departmentId: d.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.announcement.findMany({
      where: { departmentId: d.id, deletedAt: null },
      include: { author: { select: { name: true, nickname: true, avatarUrl: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 5,
    }),
  ]);

  const done = assignments.filter((a) => a.status === "DONE" || a.status === "APPROVED").length;
  const overdue = assignments.filter(
    (a) => a.dueDate && a.dueDate.getTime() < Date.now() && a.status !== "DONE" && a.status !== "APPROVED",
  ).length;

  const isMine = viewer.departmentId === d.id;

  return (
    <div className="space-y-5">
      <Link href="/departments" className="text-sm font-semibold text-pink-600">
        ← All departments
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="hs-eyebrow flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            Department workspace
          </span>
          <h1 className="hs-h1">{d.name}</h1>
          {d.description ? <p className="mt-1 text-sm text-muted">{d.description}</p> : null}
        </div>
        <Link href={`/assignments?view=board&dept=${d.slug}`} className="hs-btn hs-btn-secondary">
          Open task board
        </Link>
      </header>

      {!isMine ? (
        <p className="rounded-xl bg-white px-4 py-2.5 text-xs text-faint">
          You are viewing another department. Everything here is read-only for you.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="People" value={d.members.length} />
        <Stat label="Tasks" value={assignments.length} />
        <Stat label="Done" value={done} tone="ok" />
        <Stat label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : "default"} />
      </div>

      <Card>
        <ProgressBar
          value={assignments.length === 0 ? 0 : (done / assignments.length) * 100}
          label="Department progress"
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle
            action={
              <Link
                href={`/assignments?view=board&dept=${d.slug}`}
                className="text-sm font-semibold text-pink-600"
              >
                Board
              </Link>
            }
          >
            Department assignments
          </SectionTitle>
          {assignments.length === 0 ? (
            <EmptyState title="No tasks yet" hint="Heads create work from the assignments board." />
          ) : (
            <div className="-mx-1 space-y-0.5">
              {assignments.map((a) => (
                <AssignmentRow key={a.id} a={a as AssignmentSummary} showDepartment={false} />
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle
              action={
                <Link href="/announcements" className="text-sm font-semibold text-pink-600">
                  All
                </Link>
              }
            >
              Department announcements
            </SectionTitle>
            {announcements.length === 0 ? (
              <EmptyState title="Nothing posted" />
            ) : (
              <ul className="space-y-3">
                {announcements.map((n) => (
                  <li key={n.id} className="border-b border-[#f6ecf2] pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-ink">
                      {n.pinned ? "📌 " : ""}
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                    <p className="mt-1 text-[11px] text-faint">
                      {n.author.nickname || n.author.name} · {timeAgo(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle
              action={
                <Link href="/documents" className="text-sm font-semibold text-pink-600">
                  All
                </Link>
              }
            >
              Documents
            </SectionTitle>
            {documents.length === 0 ? (
              <EmptyState title="No documents yet" />
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-ink hover:text-pink-700"
                    >
                      {doc.title}
                    </Link>
                    <DocStatusPill status={doc.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle
              action={
                <Link href="/files" className="text-sm font-semibold text-pink-600">
                  All
                </Link>
              }
            >
              Files & assets
            </SectionTitle>
            {files.length === 0 ? (
              <EmptyState title="No assets linked" />
            ) : (
              <ul className="space-y-1.5">
                {files.map((f) => (
                  <li key={f.id}>
                    <a
                      {...assetLinkProps(f)}
                      className="block truncate text-sm text-ink hover:text-pink-700"
                    >
                      {f.name} {isStored(f) ? "↓" : "↗"}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <SectionTitle>Members</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.members.map((m) => (
            <Link
              key={m.id}
              href={`/people/${m.id}`}
              className="flex items-center gap-2.5 rounded-xl border border-[#f3e3ec] p-3 hover:border-pink-300"
            >
              <Avatar name={m.name} nickname={m.nickname} url={m.avatarUrl} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">
                  {m.nickname || m.name}
                  {m.id === d.headUserId ? (
                    <span className="ml-1.5 text-[11px] font-bold text-pink-600">HEAD</span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted">{m.roleTitle ?? "Staff"}</span>
                <span className="mt-1 block">
                  <TierPill tier={m.tier} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
