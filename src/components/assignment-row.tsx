import Link from "next/link";
import { Avatar, PriorityPill, StatusPill } from "@/components/ui";
import { isOverdue, relativeDue } from "@/lib/dates";
import type { AssignmentStatus, Priority } from "@prisma/client";

export type AssignmentSummary = {
  id: string;
  title: string;
  status: AssignmentStatus;
  priority: Priority;
  dueDate: Date | null;
  department: { name: string; color: string; slug: string };
  assignees: { user: { id: string; name: string; nickname: string | null; avatarUrl: string | null } }[];
};

export function AssignmentRow({ a, showDepartment = true }: { a: AssignmentSummary; showDepartment?: boolean }) {
  const overdue = isOverdue(a.dueDate, a.status);

  return (
    <Link
      href={`/assignments/${a.id}`}
      className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-pink-200 hover:bg-pink-50/50"
    >
      <span
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ background: a.department.color }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{a.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {showDepartment ? <span className="text-faint">{a.department.name}</span> : null}
          <span className={overdue ? "font-semibold text-red-600" : "text-muted"}>
            {relativeDue(a.dueDate)}
          </span>
        </span>
      </span>
      <span className="hidden shrink-0 sm:block">
        <PriorityPill priority={a.priority} />
      </span>
      <span className="shrink-0">
        <StatusPill status={a.status} />
      </span>
      <span className="hidden shrink-0 -space-x-1.5 sm:flex">
        {a.assignees.slice(0, 3).map((x) => (
          <Avatar
            key={x.user.id}
            name={x.user.name}
            nickname={x.user.nickname}
            url={x.user.avatarUrl}
            size={24}
          />
        ))}
      </span>
    </Link>
  );
}
