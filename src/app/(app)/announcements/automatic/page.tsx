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
import { cancelNotification, retryNotification } from "@/lib/actions/notifications";
import { RuleRow } from "@/components/notification-widgets";
import Link from "next/link";
import { Banner, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import type { NotificationRule, Priority } from "@prisma/client";

export const metadata: Metadata = { title: "Automatic messages" };
export const dynamic = "force-dynamic";

/**
 * Automatic messages and what was sent. A low-visibility corner of Announcements.
 *
 * Heads and admins only, and the split between them runs through the whole
 * page: a head composes and switches rules on for their own department, an
 * admin does that for anybody and is the only one who touches a webhook URL.
 * Everything below renders from what `can()` said, and every action re-checks
 * it — a hidden section is a tidier page, not a permission.
 */
export default async function AutomaticMessagesPage() {
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
        <PageHeader eyebrow="Announcements" title="Heads and admins manage these" />
      </div>
    );
  }

  const [rules, jobs] = await Promise.all([
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
      },
    }),
  ]);

  const graphReady = graphAvailable();
  const dispatcherReady = dispatchSecret() !== null;
  const queued = jobs.filter((job) => job.status === "QUEUED").length;
  const failed = jobs.filter((job) => job.status === "FAILED").length;

  // Which department's rules this page is editing. An admin edits the
  // portal-wide defaults; a head edits their own team's.
  const ruleScope = admin ? null : (viewer.departmentId ?? null);
  const ruleFor = (kind: string): NotificationRule | undefined =>
    rules.find((rule) => rule.kind === kind && rule.departmentId === ruleScope);

  return (
    <div className="hs-enter space-y-6">
      <PageHeader
        eyebrow="Announcements"
        title="Automatic messages"
        action={
          <Link href="/announcements" className="hs-btn hs-btn-ghost">
            Back
          </Link>
        }
      />

      {!dispatcherReady ? (
        <Banner tone="warn">
          Messages will queue but never send: <code>TEAMS_DISPATCH_SECRET</code> is not set on this
          deployment, so the dispatcher is switched off. See docs/TEAMS.md.
        </Banner>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <Card>
        <SectionTitle>
          {admin ? "Automatic messages, portal-wide" : "Automatic messages for your department"}
        </SectionTitle>
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
      <Card>
        <SectionTitle>
          What has been sent
          <span className="ml-2 text-xs font-normal text-faint">
            last 30{queued > 0 ? `, ${queued} waiting` : ""}{failed > 0 ? `, ${failed} failed` : ""}
          </span>
        </SectionTitle>
        {jobs.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
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
                        : (job.department?.name ?? "all staff")}{" "}
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
