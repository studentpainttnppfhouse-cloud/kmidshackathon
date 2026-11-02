import Link from "next/link";
import type { Metadata } from "next";
import { requireViewer } from "@/lib/authorize";
import { PageHeader } from "@/components/ui";
import { AssignmentFilters } from "@/components/assignment-filters";
import { CalendarView } from "../assignments/views";
import { loadTasks } from "../assignments/query";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; status?: string; month?: string }>;
}) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const { tasks, departments } = await loadTasks(viewer, { dept: sp.dept, status: sp.status });

  const parsed = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? new Date(`${sp.month}-01T00:00:00+07:00`) : null;
  const month = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  const link = (m: Date) => {
    const params = new URLSearchParams();
    params.set("month", monthKey(m));
    if (sp.dept) params.set("dept", sp.dept);
    if (sp.status) params.set("status", sp.status);
    return `/calendar?${params}`;
  };

  return (
    <div className="hs-enter space-y-4">
      <PageHeader
        eyebrow="Workspace"
        title="Calendar"
        action={
          <div className="flex gap-1.5">
            <Link href={link(prev)} className="hs-btn hs-btn-secondary" aria-label="Previous month">←</Link>
            <Link href="/calendar" className="hs-btn hs-btn-secondary">Today</Link>
            <Link href={link(next)} className="hs-btn hs-btn-secondary" aria-label="Next month">→</Link>
          </div>
        }
      />
      <AssignmentFilters
        departments={departments}
        dept={sp.dept}
        status={sp.status}
        keep={{ month: sp.month }}
      />
      <CalendarView items={tasks} month={month} />
    </div>
  );
}
