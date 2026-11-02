"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";

type Dept = { slug: string; name: string; color?: string };

const STATUS_DOT: Record<string, string> = {
  NOT_STARTED: "#94A3B8",
  IN_PROGRESS: "#3B82F6",
  NEEDS_REVIEW: "#F59E0B",
  APPROVED: "#8B5CF6",
  DONE: "#22C55E",
};

/**
 * One compact filter row: a department dropdown and a bar of status pills.
 * Both write to the URL so the server does the filtering (and the policy check).
 */
export function AssignmentFilters({
  departments,
  dept,
  status,
  keep = {},
}: {
  departments: Dept[];
  dept?: string;
  status?: string;
  /** Extra params to carry along (e.g. view). */
  keep?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const href = (next: { dept?: string; status?: string }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) params.set(k, v);
    if (next.dept) params.set("dept", next.dept);
    if (next.status) params.set("status", next.status);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const pill = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition";
  const on = "border-brand bg-tint-strong text-brand-deep";
  const off = "border-line bg-surface text-muted hover:text-brand-deep";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="hs-dept-filter">Department</label>
      <select
        id="hs-dept-filter"
        value={dept ?? ""}
        onChange={(e) => router.push(href({ dept: e.target.value || undefined, status }))}
        className={`${pill} ${dept ? on : off} cursor-pointer pr-6`}
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.slug} value={d.slug}>{d.name}</option>
        ))}
      </select>

      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />

      <nav className="flex flex-wrap gap-1.5" aria-label="Filter by status">
        <Link href={href({ dept })} className={`${pill} ${!status ? on : off}`}
          aria-current={!status ? "true" : undefined}>All</Link>
        {STATUS_ORDER.map((s) => (
          <Link key={s} href={href({ dept, status: status === s ? undefined : s })}
            aria-current={status === s ? "true" : undefined}
            className={`${pill} ${status === s ? on : off}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[s] }} aria-hidden="true" />
            {STATUS_LABEL[s]}
          </Link>
        ))}
        <Link href={href({ dept, status: status === "overdue" ? undefined : "overdue" })}
          className={`${pill} ${status === "overdue" ? on : off}`}>
          <span className="h-2 w-2 rounded-full" style={{ background: "#DC2626" }} aria-hidden="true" />
          Overdue
        </Link>
      </nav>
    </div>
  );
}
