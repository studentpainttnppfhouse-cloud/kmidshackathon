import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireTier, isOwner } from "@/lib/authorize";
import {
  issuePasswordReset,
  revokeAllSessionsFor,
  revokeInvite,
  unlockUser,
} from "@/lib/actions/admin";
import {
  CopyLink,
  DepartmentSelect,
  FlagToggle,
  InviteForm,
  TierSelect,
} from "@/components/admin-widgets";
import { Avatar, Banner, Card, EmptyState, SectionTitle, Stat } from "@/components/ui";
import { formatDateLong, timeAgo } from "@/lib/dates";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const viewer = await requireTier("T3_ADMIN");
  const owner = isOwner(viewer);

  const [users, invites, departments, resets, sessionCount, deletedCounts] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { sessions: { where: { revokedAt: null } } } },
      },
      orderBy: [{ tier: "desc" }, { name: "asc" }],
    }),
    db.invite.findMany({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: {
        department: { select: { name: true } },
        invitedBy: { select: { name: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
    db.passwordReset.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { select: { name: true, nickname: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    Promise.all([
      db.assignment.count({ where: { deletedAt: { not: null } } }),
      db.document.count({ where: { deletedAt: { not: null } } }),
      db.fileAsset.count({ where: { deletedAt: { not: null } } }),
    ]),
  ]);

  const lockedOut = users.filter((u) => u.lockedUntil && u.lockedUntil.getTime() > Date.now());
  const recycleBin = deletedCounts.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <header>
        <p className="hs-eyebrow">Administration</p>
        <h1 className="hs-h1">Accounts, invites & access</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active staff" value={users.filter((u) => u.isActive).length} />
        <Stat label="Pending invites" value={invites.length} />
        <Stat label="Live sessions" value={sessionCount} />
        <Stat label="Recycle bin" value={recycleBin} tone={recycleBin > 0 ? "warn" : "default"} />
      </div>

      {lockedOut.length > 0 ? (
        <Banner tone="warn">
          {lockedOut.length} account{lockedOut.length > 1 ? "s are" : " is"} locked after failed
          sign-ins. Unlock below — a lockout clears itself after 15 minutes.
        </Banner>
      ) : null}

      <Card>
        <SectionTitle>Invite staff</SectionTitle>
        <p className="mb-4 -mt-2 text-sm text-muted">
          Registration is invite-only. Create the invite, copy the link, and send
          it on LINE — the portal sends no email by design.
        </p>
        <InviteForm
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          canCreateOwner={owner}
        />
      </Card>

      <Card>
        <SectionTitle>Pending invites</SectionTitle>
        {invites.length === 0 ? (
          <EmptyState title="No invites waiting" />
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f3e3ec] p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{inv.email}</p>
                  <p className="text-xs text-faint">
                    {inv.department?.name ?? "No department"} ·{" "}
                    {inv.invitedBy.nickname || inv.invitedBy.name} · expires{" "}
                    {formatDateLong(inv.expiresAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <CopyLink path={`/invite/${inv.code}`} label="Copy invite link" />
                  <form
                    action={async () => {
                      "use server";
                      await revokeInvite(inv.id);
                    }}
                  >
                    <button type="submit" className="hs-btn hs-btn-ghost px-3 py-1.5 text-xs">
                      Revoke
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {resets.length > 0 ? (
        <Card>
          <SectionTitle>Open password resets</SectionTitle>
          <ul className="space-y-2">
            {resets.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {r.user.nickname || r.user.name}
                  </p>
                  <p className="text-xs text-muted">
                    {r.user.email} · expires {formatDateLong(r.expiresAt)}
                  </p>
                </div>
                <CopyLink path={`/reset/${r.code}`} label="Copy reset link" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Users</SectionTitle>
        <div className="space-y-2">
          {users.map((u) => {
            const locked = u.lockedUntil && u.lockedUntil.getTime() > Date.now();
            return (
              <div key={u.id} className="rounded-xl border border-[#f3e3ec] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={u.name} nickname={u.nickname} url={u.avatarUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/people/${u.id}`}
                      className="block truncate text-sm font-bold text-ink hover:text-pink-700"
                    >
                      {u.nickname || u.name}
                      {u.id === viewer.id ? (
                        <span className="ml-1.5 text-[11px] font-normal text-faint">(you)</span>
                      ) : null}
                    </Link>
                    <p className="truncate text-xs text-faint">
                      {u.email} · {u._count.sessions} device
                      {u._count.sessions === 1 ? "" : "s"} ·{" "}
                      {u.lastLoginAt ? `last in ${timeAgo(u.lastLoginAt)}` : "never signed in"}
                      {!u.passwordHash ? " · no password set" : ""}
                    </p>
                  </div>

                  <TierSelect
                    userId={u.id}
                    current={u.tier}
                    disabled={u.id === viewer.id}
                    canSetOwner={owner}
                  />
                  <DepartmentSelect
                    userId={u.id}
                    current={u.departmentId}
                    departments={departments.map((d) => ({ id: d.id, name: d.name }))}
                  />
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-4 border-t border-[#f8eef3] pt-2.5">
                  <FlagToggle userId={u.id} flag="isActive" value={u.isActive} label="Active" />
                  <FlagToggle userId={u.id} flag="isReserve" value={u.isReserve} label="Reserve" />
                  <FlagToggle userId={u.id} flag="isMentor" value={u.isMentor} label="Mentor" />
                  <FlagToggle userId={u.id} flag="isAlumni" value={u.isAlumni} label="Alumni" />

                  <span className="ml-auto flex flex-wrap gap-2">
                    {locked ? (
                      <form
                        action={async () => {
                          "use server";
                          await unlockUser(u.id);
                        }}
                      >
                        <button type="submit" className="hs-btn hs-btn-danger px-3 py-1.5 text-xs">
                          Unlock account
                        </button>
                      </form>
                    ) : null}

                    {owner ? (
                      <>
                        <form
                          action={async () => {
                            "use server";
                            await issuePasswordReset(u.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="hs-btn hs-btn-secondary px-3 py-1.5 text-xs"
                          >
                            Issue reset link
                          </button>
                        </form>
                        {u._count.sessions > 0 ? (
                          <form
                            action={async () => {
                              "use server";
                              await revokeAllSessionsFor(u.id);
                            }}
                          >
                            <button
                              type="submit"
                              className="hs-btn hs-btn-ghost px-3 py-1.5 text-xs"
                            >
                              Sign out all devices
                            </button>
                          </form>
                        ) : null}
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {owner ? (
        <Card>
          <SectionTitle>Data</SectionTitle>
          <p className="mb-3 -mt-2 text-sm text-muted">
            The export works from day one. If the project stalls or the hosting
            goes away, the data still comes out.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export" className="hs-btn hs-btn-primary">
              Export everything (JSON)
            </a>
            <Link href="/admin/audit" className="hs-btn hs-btn-secondary">
              Audit log
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
