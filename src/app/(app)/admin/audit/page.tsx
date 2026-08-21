import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireTier } from "@/lib/authorize";
import { Avatar, Card, EmptyState, SectionTitle } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireTier("T3_ADMIN");
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const perPage = 60;

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      include: { user: { select: { name: true, nickname: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.auditLog.count(),
  ]);

  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <Link href="/admin" className="text-sm font-semibold text-pink-600">
        ← Admin
      </Link>

      <header>
        <p className="hs-eyebrow">Audit</p>
        <h1 className="hs-h1">Who did what</h1>
        <p className="mt-1 text-sm text-muted">
          {total.toLocaleString()} entries. Passwords, reset codes and session
          tokens are never recorded here — only that they happened.
        </p>
      </header>

      <Card>
        <SectionTitle>All actions</SectionTitle>
        {entries.length === 0 ? (
          <EmptyState title="Nothing logged yet" />
        ) : (
          <ul className="divide-y divide-[#f8eef3]">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <Avatar
                  name={e.user?.name ?? "System"}
                  nickname={e.user?.nickname}
                  url={e.user?.avatarUrl}
                  size={26}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">
                    <span className="font-semibold">
                      {e.user?.nickname || e.user?.name || "System"}
                    </span>{" "}
                    <span className="font-mono text-xs text-pink-700">{e.action}</span>
                    {e.detail ? <span className="text-muted"> · {e.detail}</span> : null}
                  </span>
                  <span className="block text-[11px] text-faint">
                    {e.targetType ? `${e.targetType} ` : ""}
                    {formatDateTime(e.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 ? (
          <div className="mt-4 flex items-center justify-between border-t border-[#f6ecf2] pt-3 text-sm">
            {page > 1 ? (
              <Link href={`/admin/audit?page=${page - 1}`} className="font-semibold text-pink-600">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-faint">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={`/admin/audit?page=${page + 1}`} className="font-semibold text-pink-600">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
