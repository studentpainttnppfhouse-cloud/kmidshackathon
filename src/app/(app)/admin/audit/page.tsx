import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTier } from "@/lib/authorize";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/dates";
import { LiveRefresh } from "./live-refresh";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

type SP = {
  tab?: string;
  page?: string;
  user?: string;
  action?: string;
  result?: string;
  from?: string;
  to?: string;
  failures?: string;
};

const RESULTS = ["success", "failed", "denied"] as const;
const PER_PAGE = 50;

const RESULT_STYLE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  denied: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

function ResultPill({ result }: { result: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${
        RESULT_STYLE[result] ?? RESULT_STYLE.success
      }`}
    >
      {result}
    </span>
  );
}

/** "page.access.set" → "Page access set" */
function humanAction(action: string): string {
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function parseDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildWhere(sp: SP): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (sp.user === "system") where.userId = null;
  else if (sp.user) where.userId = sp.user;
  if (sp.action) where.action = { startsWith: sp.action };
  if (sp.failures === "1") where.result = { in: ["failed", "denied"] };
  else if (sp.result && (RESULTS as readonly string[]).includes(sp.result)) where.result = sp.result;
  const from = parseDate(sp.from);
  const to = parseDate(sp.to, true);
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  return where;
}

function qs(sp: SP, patch: Partial<SP>): string {
  const merged = { ...sp, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `/admin/audit?${s}` : "/admin/audit";
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireTier("T3_ADMIN");
  const sp = await searchParams;
  const tab = sp.tab === "live" ? "live" : "log";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        action={
          <Link href="/admin" className="hs-btn hs-btn-ghost">
            Back to admin
          </Link>
        }
      />

      <nav aria-label="Audit views" className="flex gap-1.5 border-b border-line pb-2">
        <Link
          href="/admin/audit"
          aria-current={tab === "log" ? "page" : undefined}
          className={`hs-btn px-3 py-1.5 text-sm ${tab === "log" ? "hs-btn-primary" : "hs-btn-ghost"}`}
        >
          All entries
        </Link>
        <Link
          href="/admin/audit?tab=live"
          aria-current={tab === "live" ? "page" : undefined}
          className={`hs-btn px-3 py-1.5 text-sm ${tab === "live" ? "hs-btn-primary" : "hs-btn-ghost"}`}
        >
          Live activity
        </Link>
      </nav>

      {tab === "live" ? <LiveActivity /> : <AuditTable sp={sp} />}
    </div>
  );
}

async function LiveActivity() {
  const recent = await db.auditLog.findMany({
    include: { user: { select: { name: true, nickname: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Latest activity</h2>
        <LiveRefresh />
      </div>
      {recent.length === 0 ? (
        <EmptyState title="Quiet so far" />
      ) : (
        <ul className="space-y-2.5 text-sm">
          {recent.map((r) => (
            <li key={r.id} className="flex items-start gap-2.5">
              <Avatar
                name={r.user?.name ?? "System"}
                nickname={r.user?.nickname}
                url={r.user?.avatarUrl}
                size={24}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">
                  {r.user?.nickname || r.user?.name || "System"}
                </span>{" "}
                <span className="text-muted">{r.detail || humanAction(r.action)}</span>{" "}
                {r.result !== "success" ? <ResultPill result={r.result} /> : null}
                {r.reason ? <span className="block text-xs text-muted">{r.reason}</span> : null}
                <span className="block text-[11px] text-faint">{timeAgo(r.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function AuditTable({ sp }: { sp: SP }) {
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const where = buildWhere(sp);

  const [entries, total, people, actions] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { name: true, nickname: true, avatarUrl: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    db.auditLog.count({ where }),
    db.user.findMany({
      where: { auditEntries: { some: {} } },
      select: { id: true, name: true, nickname: true },
      orderBy: { name: "asc" },
    }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);

  // Group actions by their first segment ("login", "page", …) for a short list.
  const actionTypes = Array.from(new Set(actions.map((a) => a.action.split(".")[0]))).sort();
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <>
      <Card>
        <form method="get" action="/admin/audit" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs text-faint">
            Person
            <select name="user" defaultValue={sp.user ?? ""} className="hs-input mt-0.5 w-full py-1 text-sm">
              <option value="">Anyone</option>
              <option value="system">System / anonymous</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname ? `${p.nickname} (${p.name})` : p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-faint">
            Action type
            <select name="action" defaultValue={sp.action ?? ""} className="hs-input mt-0.5 w-full py-1 text-sm">
              <option value="">Any action</option>
              {actionTypes.map((a) => (
                <option key={a} value={a}>
                  {humanAction(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-faint">
            Result
            <select name="result" defaultValue={sp.result ?? ""} className="hs-input mt-0.5 w-full py-1 text-sm">
              <option value="">Any result</option>
              {RESULTS.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-faint">
            From
            <input type="date" name="from" defaultValue={sp.from ?? ""} className="hs-input mt-0.5 w-full py-1 text-sm" />
          </label>
          <label className="text-xs text-faint">
            To
            <input type="date" name="to" defaultValue={sp.to ?? ""} className="hs-input mt-0.5 w-full py-1 text-sm" />
          </label>
          <div className="flex flex-col justify-end gap-1.5">
            <label className="flex items-center gap-1.5 text-xs text-ink">
              <input type="checkbox" name="failures" value="1" defaultChecked={sp.failures === "1"} />
              Failures only
            </label>
            <div className="flex gap-1.5">
              <button type="submit" className="hs-btn hs-btn-primary px-3 py-1 text-xs">
                Filter
              </button>
              <Link href="/admin/audit" className="hs-btn hs-btn-ghost px-3 py-1 text-xs">
                Clear
              </Link>
            </div>
          </div>
        </form>
      </Card>

      <Card>
        <p className="mb-2 text-xs text-faint">{total.toLocaleString()} entries</p>
        {entries.length === 0 ? (
          <EmptyState title="No matching entries" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-faint">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Who</th>
                  <th className="py-2 pr-3">What</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-line/60 align-top">
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted" title={formatDateTime(e.createdAt)}>
                      {formatDateTime(e.createdAt)}
                      <span className="block text-[11px] text-faint">{timeAgo(e.createdAt)}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <Avatar
                          name={e.user?.name ?? "System"}
                          nickname={e.user?.nickname}
                          url={e.user?.avatarUrl}
                          size={22}
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold text-ink">
                            {e.user?.nickname || e.user?.name || "System"}
                          </span>
                          {e.user?.email ? (
                            <span className="block text-[11px] text-faint">{e.user.email}</span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="block text-ink">{humanAction(e.action)}</span>
                      {e.detail ? <span className="block text-xs text-muted">{e.detail}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">
                      {e.targetType ? (
                        <>
                          <span className="font-semibold capitalize">{e.targetType}</span>
                          {e.targetId ? (
                            <span className="block max-w-[18ch] truncate font-mono text-[11px] text-faint">
                              {e.targetId}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <ResultPill result={e.result} />
                      {e.reason ? (
                        <span className="mt-0.5 block max-w-[30ch] text-xs text-muted">{e.reason}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 ? (
          <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3 text-sm">
            {page > 1 ? (
              <Link href={qs(sp, { page: String(page - 1) })} className="font-semibold text-brand-deep">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-faint">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={qs(sp, { page: String(page + 1) })} className="font-semibold text-brand-deep">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </Card>
    </>
  );
}
