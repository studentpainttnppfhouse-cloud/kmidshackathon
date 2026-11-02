import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer, isAdmin } from "@/lib/authorize";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import {
  AddPersonButton,
  PeopleTable,
  RecoveryDecision,
  type PersonRow,
} from "./people-widgets";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  USERNAME: "Forgot username",
  PASSWORD: "Forgot password",
  EMAIL: "Forgot email",
  OTHER: "Other",
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; add?: string }>;
}) {
  const viewer = await requireViewer();
  const admin = isAdmin(viewer);
  const { tab, add } = await searchParams;
  const showRequests = admin && tab === "requests";

  const [people, departments, pendingCount] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        nickname: true,
        username: true,
        email: true,
        roleTitle: true,
        tier: true,
        avatarUrl: true,
        isActive: true,
        passwordHash: true,
        lastLoginAt: true,
        department: { select: { name: true, color: true, slug: true, sortOrder: true } },
      },
      orderBy: [{ tier: "desc" }, { name: "asc" }],
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    admin ? db.recoveryRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
  ]);

  // Only what the viewer may see goes to the browser; the hash never leaves.
  const rows: PersonRow[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    nickname: p.nickname,
    username: admin ? p.username : null,
    email: admin ? p.email : null,
    roleTitle: p.roleTitle,
    tier: p.tier,
    avatarUrl: p.avatarUrl,
    isActive: p.isActive,
    hasPassword: admin ? Boolean(p.passwordHash) : null,
    lastLoginAt: admin && p.lastLoginAt ? p.lastLoginAt.toISOString() : null,
    department: p.department,
  }));

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="People"
        title="People"
        action={
          admin ? (
            <AddPersonButton departments={departments} viewerTier={viewer.tier} startOpen={add === "1"} />
          ) : null
        }
      />

      {admin ? (
        <nav className="flex gap-1 border-b border-line" aria-label="People sections">
          <Link
            href="/people"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${!showRequests ? "border-brand text-brand-deep" : "border-transparent text-muted"}`}
          >
            Directory
          </Link>
          <Link
            href="/people?tab=requests"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${showRequests ? "border-brand text-brand-deep" : "border-transparent text-muted"}`}
          >
            Requests
            {pendingCount > 0 ? (
              <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            ) : null}
          </Link>
        </nav>
      ) : null}

      {showRequests ? (
        <RequestsTab viewerId={viewer.id} people={rows} />
      ) : (
        <PeopleTable people={rows} isAdmin={admin} />
      )}
    </div>
  );
}

async function RequestsTab({ viewerId, people }: { viewerId: string; people: PersonRow[] }) {
  const [pending, recent] = await Promise.all([
    db.recoveryRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100 }),
    db.recoveryRequest.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { resolvedAt: "desc" },
      take: 20,
    }),
  ]);

  // Opening the queue counts as having seen the notices about it.
  await db.portalNotice.updateMany({
    where: { userId: viewerId, readAt: null, href: "/people?tab=requests" },
    data: { readAt: new Date() },
  });

  const options = people.map((p) => ({
    id: p.id,
    label: `${p.nickname || p.name} · ${p.email ?? ""}`,
  }));
  const nameOf = new Map(people.map((p) => [p.id, p.nickname || p.name]));

  return (
    <div className="space-y-4">
      {pending.length === 0 ? (
        <EmptyState title="No open requests" />
      ) : (
        pending.map((r) => (
          <div key={r.id} className="hs-card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-ink">
                {r.name || r.contact}
                <span className="ml-2 hs-pill bg-warn-soft text-warn-strong">{KIND_LABEL[r.kind]}</span>
              </p>
              <span className="text-xs text-faint">{formatDateTime(r.createdAt)}</span>
            </div>
            <p className="text-xs text-muted">
              Wrote: <span className="font-semibold text-ink">{r.contact}</span>
              {r.matchedUserId ? ` · looks like ${nameOf.get(r.matchedUserId) ?? "a known account"}` : " · no account matched"}
            </p>
            {r.message ? (
              <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm text-ink">{r.message}</p>
            ) : null}
            <RecoveryDecision
              request={{
                id: r.id,
                kind: r.kind,
                contact: r.contact,
                name: r.name,
                message: r.message,
                matchedUserId: r.matchedUserId,
                createdAt: r.createdAt.toISOString(),
              }}
              people={options}
            />
          </div>
        ))
      )}

      {recent.length > 0 ? (
        <div className="hs-card p-4">
          <p className="hs-eyebrow mb-2">Recently handled</p>
          <ul className="space-y-1.5 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-ink">
                  {r.name || r.contact} · {KIND_LABEL[r.kind]}
                </span>
                <span className={r.status === "APPROVED" ? "text-ok-strong" : "text-danger-strong"}>
                  {r.status === "APPROVED" ? "Approved" : "Denied"}
                  {r.resolvedById ? ` by ${nameOf.get(r.resolvedById) ?? "an admin"}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
