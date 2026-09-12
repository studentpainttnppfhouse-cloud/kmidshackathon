import type { Metadata } from "next";
import { db } from "@/lib/db";
import { can, isAdmin, requireViewer } from "@/lib/authorize";
import { formatDateTime, timeAgo } from "@/lib/dates";
import {
  AUTOMATIC_KINDS,
  NOTIFICATION_KIND_LABEL,
  NOTIFICATION_STATUS_LABEL,
  PRIORITY_LABEL,
} from "@/lib/constants";
import { graphAvailable, dispatchSecret } from "@/lib/teams/config";
import { notifiablePeople } from "@/lib/teams/notify";
import {
  cancelNotification,
  deleteTeamsTarget,
  retryNotification,
  toggleTeamsTarget,
  unlinkTeamsIdentity,
} from "@/lib/actions/notifications";
import {
  LinkIdentityForm,
  NotificationComposer,
  RuleRow,
  TeamsTargetForm,
  TestTargetButton,
} from "@/components/notification-widgets";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Banner, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import type { NotificationRule, Priority } from "@prisma/client";

export const metadata: Metadata = { title: "Teams notifications" };
export const dynamic = "force-dynamic";

/**
 * The one screen for telling people things.
 *
 * Heads and admins only, and the split between them runs through the whole
 * page: a head composes and switches rules on for their own department, an
 * admin does that for anybody and is the only one who touches a webhook URL.
 * Everything below renders from what `can()` said, and every action re-checks
 * it — a hidden section is a tidier page, not a permission.
 */
export default async function NotificationsPage() {
  const viewer = await requireViewer();

  const canBroadcast = can(viewer, "notify", { kind: "notification", departmentId: null });
  const admin = isAdmin(viewer);

  const departments = await db.department.findMany({ orderBy: { sortOrder: "asc" } });
  const mine = departments.filter((department) =>
    can(viewer, "notify", { kind: "notification", departmentId: department.id }),
  );

  // A member who reached the URL directly gets a sentence rather than a 403.
  if (!canBroadcast && mine.length === 0) {
    return (
      <div className="hs-enter space-y-4">
        <PageHeader eyebrow="Teams" title="Heads and admins send these" />
        <p className="text-sm text-muted">
          Notifications land on everyone&rsquo;s phone, so sending one is a head&rsquo;s call. Ask
          yours if something needs to go out.
        </p>
      </div>
    );
  }

  const [targets, rules, jobs, people, identities] = await Promise.all([
    db.teamsTarget.findMany({
      orderBy: [{ departmentId: "asc" }, { createdAt: "asc" }],
      include: { department: { select: { name: true } } },
    }),
    db.notificationRule.findMany(),
    db.notificationJob.findMany({
      // A head sees their own department's log and the all-staff one; an admin
      // sees the lot. Written as an OR because `in` cannot carry a null, which
      // is how "all staff" is spelled.
      where: admin
        ? {}
        : {
            OR: [{ departmentId: { in: mine.map((d) => d.id) } }, { departmentId: null }],
          },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        department: { select: { name: true } },
        recipient: { select: { name: true, nickname: true } },
        target: { select: { label: true } },
      },
    }),
    notifiablePeople({ id: viewer.id, tier: viewer.tier, departmentId: viewer.departmentId }),
    db.teamsIdentity.findMany({
      include: { user: { select: { id: true, name: true, nickname: true, departmentId: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Which channel each department's message actually lands in. A department
  // with no channel of its own falls back to the all-staff one, which is the
  // difference between a message going out and a message going nowhere — but
  // it also widens the audience beyond what the sender picked. So the composer
  // is told, and says so, rather than letting a head find out afterwards.
  const sharedTarget = targets.find((t) => t.departmentId === null && t.isActive) ?? null;
  const routing = Object.fromEntries(
    mine.map((department) => {
      const own = targets.find((t) => t.departmentId === department.id && t.isActive);
      return [
        department.id,
        own
          ? { label: own.label, shared: false }
          : sharedTarget
            ? { label: sharedTarget.label, shared: true }
            : null,
      ];
    }),
  );

  const graphReady = graphAvailable();
  const dispatcherReady = dispatchSecret() !== null;
  const queued = jobs.filter((job) => job.status === "QUEUED").length;
  const failed = jobs.filter((job) => job.status === "FAILED").length;

  // Which department's rules this page is editing. An admin edits the
  // portal-wide defaults; a head edits their own team's.
  const ruleScope = admin ? null : (viewer.departmentId ?? null);
  const ruleFor = (kind: string): NotificationRule | undefined =>
    rules.find((rule) => rule.kind === kind && rule.departmentId === ruleScope);

  const visibleIdentities = admin
    ? identities
    : identities.filter((row) => row.user.departmentId === viewer.departmentId);

  return (
    <div className="hs-enter space-y-6">
      <PageHeader
        eyebrow="Teams"
        title="Notifications"
        subtitle="Messages the portal sends into Microsoft Teams: what goes automatically, and what you send by hand."
      />

      {targets.length === 0 ? (
        <Banner tone="warn">
          No Teams channel is connected yet, so nothing can be sent.{" "}
          {admin
            ? "Add one under Teams channels below."
            : "Ask an admin to connect one for your department."}
        </Banner>
      ) : null}

      {!dispatcherReady ? (
        <Banner tone="warn">
          Messages will queue but never send: <code>TEAMS_DISPATCH_SECRET</code> is not set on this
          deployment, so the dispatcher is switched off. See docs/TEAMS.md.
        </Banner>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <Card>
        <SectionTitle>Send something now</SectionTitle>
        <NotificationComposer
          departments={mine.map((d) => ({ id: d.id, name: d.name }))}
          people={people}
          canBroadcast={canBroadcast}
          defaultDepartmentId={viewer.departmentId ?? undefined}
          routing={routing}
          graphReady={graphReady}
          cadence={
            dispatcherReady
              ? "Queued messages go out on the next dispatch run."
              : "The dispatcher is off, so this will queue and wait."
          }
        />
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card>
        <SectionTitle>
          {admin ? "Automatic messages, portal-wide" : "Automatic messages for your department"}
        </SectionTitle>
        <p className="mb-4 text-sm text-muted">
          {admin
            ? "These are the defaults. A head can override any of them for their own department."
            : "These apply to your department only, and override the portal-wide default."}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {AUTOMATIC_KINDS.map((kind) => {
            const rule = ruleFor(kind);
            // The run sheet is one shared thing, so its reminder is set once
            // for the portal rather than per department.
            const locked =
              kind === "EVENT_SOON" && !admin
                ? "Run sheet reminders are set for the whole portal by an admin."
                : undefined;

            return (
              <RuleRow
                key={kind}
                kind={kind}
                departmentId={ruleScope}
                enabled={rule?.enabled ?? false}
                leadHours={rule?.leadHours ?? 24}
                minPriority={(rule?.minPriority ?? "LOW") as Priority}
                pingPeople={rule?.pingPeople ?? false}
                graphReady={graphReady}
                locked={locked}
              />
            );
          })}
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {admin ? (
        <Card>
          <SectionTitle>Teams channels</SectionTitle>
          <p className="mb-4 text-sm text-muted">
            A webhook URL lets anything holding it post into the channel, so it is stored encrypted
            and only ever shown as the host it points at.
          </p>

          {targets.length > 0 ? (
            <ul className="mb-5 space-y-2">
              {targets.map((target) => (
                <li
                  key={target.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-line p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {target.label}
                      {!target.isActive ? (
                        <span className="ml-2 text-xs font-normal text-faint">(switched off)</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {target.department?.name ?? "All staff"} · {target.urlHost} · ends{" "}
                      {target.urlHint || "????"}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      {target.sendCount} sent
                      {target.lastOkAt ? ` · last ok ${timeAgo(target.lastOkAt)}` : ""}
                    </p>
                    {target.lastError ? (
                      <p className="mt-1 max-w-prose text-xs text-red-600 dark:text-red-400">
                        Last error: {target.lastError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start gap-2">
                    <TestTargetButton targetId={target.id} />
                    <form action={toggleTeamsTarget.bind(null, target.id)}>
                      <button type="submit" className="hs-btn hs-btn-ghost px-3 py-1.5 text-xs">
                        {target.isActive ? "Switch off" : "Switch on"}
                      </button>
                    </form>
                    <ConfirmDelete
                      action={deleteTeamsTarget.bind(null, target.id)}
                      label="Remove"
                      title={`Remove ${target.label}?`}
                      body="Anything still queued for this channel is cancelled. The webhook itself stays alive in Teams until somebody deletes it there."
                      confirmLabel="Remove it"
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <TeamsTargetForm departments={departments.map((d) => ({ id: d.id, name: d.name }))} />
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <Card>
        <SectionTitle>People and Teams</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          Linking an account is what lets the portal @mention somebody in a card
          {graphReady ? " and send them a private notification" : ""}. It is usually their school
          address.
        </p>

        <LinkIdentityForm
          people={people.map((person) => ({ id: person.id, name: person.name }))}
        />

        {visibleIdentities.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {visibleIdentities.map((identity) => (
              <li
                key={identity.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-2"
              >
                <span className="min-w-0 text-sm text-ink">
                  {identity.user.nickname ?? identity.user.name}
                  <span className="text-faint"> · {identity.upn}</span>
                </span>
                <form action={unlinkTeamsIdentity.bind(null, identity.userId)}>
                  <button type="submit" className="hs-btn hs-btn-ghost px-2.5 py-1 text-xs">
                    Unlink
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-faint">Nobody is linked yet.</p>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card>
        <SectionTitle>What has been sent</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          The last 30 messages{queued > 0 ? `, ${queued} still waiting` : ""}
          {failed > 0 ? `, ${failed} failed` : ""}.
        </p>

        {jobs.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
            hint="Messages you send, and the automatic ones, both show up here with whatever Teams said back."
          />
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-[12px] border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{job.title}</p>
                    <p className="text-xs text-muted">
                      {NOTIFICATION_KIND_LABEL[job.kind]} ·{" "}
                      {job.recipient
                        ? `to ${job.recipient.nickname ?? job.recipient.name}, privately`
                        : (job.target?.label ?? job.department?.name ?? "all staff")}{" "}
                      · {PRIORITY_LABEL[job.priority]}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      {NOTIFICATION_STATUS_LABEL[job.status]}
                      {job.sentAt ? ` ${timeAgo(job.sentAt)}` : ""}
                      {job.status === "QUEUED" && job.notBefore > new Date()
                        ? ` · next try ${formatDateTime(job.notBefore)}`
                        : ""}
                      {job.attempts > 0 ? ` · ${job.attempts} attempt(s)` : ""}
                    </p>
                    {job.lastError ? (
                      <p className="mt-1 max-w-prose text-xs text-red-600 dark:text-red-400">
                        {job.lastError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {job.status === "QUEUED" ? (
                      <form action={cancelNotification.bind(null, job.id)}>
                        <button type="submit" className="hs-btn hs-btn-ghost px-2.5 py-1 text-xs">
                          Cancel
                        </button>
                      </form>
                    ) : null}
                    {job.status === "FAILED" ? (
                      <form action={retryNotification.bind(null, job.id)}>
                        <button type="submit" className="hs-btn hs-btn-ghost px-2.5 py-1 text-xs">
                          Try again
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
