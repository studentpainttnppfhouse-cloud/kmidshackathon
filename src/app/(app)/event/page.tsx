import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireViewer, isAdmin } from "@/lib/authorize";
import { EVENT_DAYS } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { isEventPanelVisible } from "@/lib/settings";
import { CheckinButton, IncidentForm } from "@/components/event-widgets";
import { Avatar, Banner, Card, EmptyState, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Event Day" };
export const dynamic = "force-dynamic";

/**
 * Event-day mode. Mobile-first, big touch targets, as few queries as the page
 * can get away with — this is the screen people use under stress, on hotel
 * wifi, at 7 AM.
 */
export default async function EventPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const day = sp.day && EVENT_DAYS.includes(sp.day as (typeof EVENT_DAYS)[number])
    ? sp.day
    : EVENT_DAYS.includes(today as (typeof EVENT_DAYS)[number])
      ? today
      : EVENT_DAYS[1];

  const admin = isAdmin(viewer);

  // The panel can be switched off from the admin page while the run sheet is
  // still empty. That hides the navigation link; this is what makes the URL
  // behave the same way, so "hidden" is not just a missing button.
  const panelVisible = await isEventPanelVisible();
  if (!panelVisible && !admin) notFound();

  const [runSheet, myCheckin, checkedInCount, incidents, reserves] = await Promise.all([
    db.eventItem.findMany({
      where: { day },
      orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }],
    }),
    db.checkin.findFirst({
      where: { userId: viewer.id, day, checkedOutAt: null },
      orderBy: { checkedInAt: "desc" },
    }),
    db.checkin.count({ where: { day, checkedOutAt: null } }),
    // Incident log is Admin-only. The `can()` rule says so; this query simply
    // never runs for anyone else.
    admin
      ? db.incident.findMany({
          where: { resolvedAt: null },
          include: { reportedBy: { select: { name: true, nickname: true, avatarUrl: true } } },
          orderBy: { occurredAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    admin
      ? db.user.findMany({
          where: { isReserve: true, deletedAt: null },
          select: { id: true, name: true, nickname: true, avatarUrl: true, isActive: true },
        })
      : Promise.resolve([]),
  ]);

  // "What's happening now" is computed from wall-clock time in ICT.
  const nowHHMM = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(new Date());

  const currentIndex = runSheet.findIndex(
    (item) => item.startTime <= nowHHMM && (!item.endTime || item.endTime > nowHHMM),
  );
  const isLive = day === today && currentIndex !== -1;

  return (
    <div className="hs-enter space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hs-eyebrow">Event-day mode</p>
          <h1 className="hs-h1">Run sheet</h1>
        </div>
        <div className="flex gap-1.5">
          {EVENT_DAYS.map((d, i) => (
            <a
              key={d}
              href={`/event?day=${d}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                day === d ? "bg-brand-solid text-on-brand" : "bg-surface text-muted hover:text-brand-deep"
              }`}
            >
              Day {i + 1}
            </a>
          ))}
        </div>
      </header>

      {!panelVisible ? (
        <Banner tone="warn">
          This panel is hidden from everybody except admins. Turn it on from the admin page when
          the run sheet is ready.
        </Banner>
      ) : null}

      {day === today ? (
        <Banner tone="ok">Today is an event day. {checkedInCount} staff checked in right now.</Banner>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle>Staff check-in</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            {myCheckin
              ? `Checked in at ${formatDateTime(myCheckin.checkedInAt)}.`
              : "Tap once when you arrive."}
          </p>
          <CheckinButton day={day} checkedIn={Boolean(myCheckin)} />
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>Quick reference</SectionTitle>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-tint p-3">
              <dt className="hs-eyebrow">Emergency</dt>
              <dd className="mt-0.5 text-lg font-extrabold text-brand-deep">1669</dd>
              <dd className="text-xs text-muted">School nurse · 7F-201</dd>
            </div>
            <div className="rounded-xl bg-tint p-3">
              <dt className="hs-eyebrow">Staff WiFi</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold text-brand-deep">
                KMIDS-Event / hack2027
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-faint">
            Print this page before the event. If the portal is unreachable on
            the day, paper is the fallback that always works.
          </p>
        </Card>
      </div>

      <Card>
        <SectionTitle>{isLive ? "Happening now" : "Schedule"}</SectionTitle>
        {runSheet.length === 0 ? (
          <EmptyState
            title="The run sheet is empty"
            hint="Operations builds this out closer to the event."
          />
        ) : (
          <ol className="space-y-2">
            {runSheet.map((item, i) => {
              const isNow = isLive && i === currentIndex;
              const isNext = isLive && i === currentIndex + 1;
              return (
                <li
                  key={item.id}
                  className={`flex gap-3 rounded-xl border p-3 ${
                    isNow
                      ? "border-brand bg-tint"
                      : isNext
                        ? "border-edge"
                        : "border-line"
                  }`}
                >
                  <span className="w-24 shrink-0 font-mono text-sm font-bold text-brand-deep">
                    {item.startTime}
                    {item.endTime ? (
                      <span className="block text-[11px] font-normal text-faint">
                        → {item.endTime}
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">
                      {item.title}
                      {isNow ? (
                        <span className="ml-2 hs-pill bg-brand-solid text-on-brand">Now</span>
                      ) : null}
                      {isNext ? (
                        <span className="ml-2 hs-pill bg-tint-strong text-brand-deep">Next</span>
                      ) : null}
                    </span>
                    {item.location ? (
                      <span className="block text-xs text-muted">{item.location}</span>
                    ) : null}
                    {item.notes ? (
                      <span className="mt-0.5 block text-xs text-faint">{item.notes}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card className="hs-no-print">
        <SectionTitle>Report an incident</SectionTitle>
        <p className="mb-3 -mt-2 text-sm text-muted">
          Anyone can file one. Only Administration can read the log.
        </p>
        <IncidentForm />
      </Card>

      {admin ? (
        <>
          <Card>
            <SectionTitle>Incident log · Administration only</SectionTitle>
            {incidents.length === 0 ? (
              <EmptyState title="Nothing open" />
            ) : (
              <ul className="space-y-2">
                {incidents.map((inc) => (
                  <li
                    key={inc.id}
                    className={`rounded-xl border p-3 ${
                      inc.severity === "high"
                        ? "border-danger-edge bg-danger-soft"
                        : inc.severity === "medium"
                          ? "border-warn-edge bg-warn-soft"
                          : "border-line"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="hs-pill bg-surface text-ink">{inc.severity}</span>
                      <span className="text-[11px] text-faint">
                        {formatDateTime(inc.occurredAt)}
                      </span>
                    </div>
                    <p className="text-sm text-ink">{inc.description}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                      <Avatar
                        name={inc.reportedBy.name}
                        nickname={inc.reportedBy.nickname}
                        url={inc.reportedBy.avatarUrl}
                        size={16}
                      />
                      {inc.reportedBy.nickname || inc.reportedBy.name}
                      {inc.location ? ` · ${inc.location}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle>Reserve staff</SectionTitle>
            {reserves.length === 0 ? (
              <EmptyState title="No reserve staff flagged" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {reserves.map((r) => (
                  <span
                    key={r.id}
                    className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-3 text-xs font-semibold"
                  >
                    <Avatar name={r.name} nickname={r.nickname} url={r.avatarUrl} size={22} />
                    {r.nickname || r.name}
                    <span className={r.isActive ? "text-ok-strong" : "text-faint"}>
                      {r.isActive ? "· active" : "· standby"}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
