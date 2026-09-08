import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireTier } from "@/lib/authorize";
import { revokeJoinLink } from "@/lib/actions/join-links";
import { CopyLink } from "@/components/admin-widgets";
import { JoinLinkForm } from "@/components/join-link-widgets";
import { QrCode } from "@/components/qr";
import { Banner, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { JOIN_LINK_MAX_TIER, TIER_LABEL } from "@/lib/constants";
import { joinLinkStatus, usesLabel } from "@/lib/join-links";
import { appOrigin } from "@/lib/request";
import { formatDateLong } from "@/lib/dates";

export const metadata: Metadata = { title: "Invite people" };
export const dynamic = "force-dynamic";

/**
 * One link and one code for the whole team, the way Teams does it.
 *
 * The per-person invite on the admin page is still the right tool for one
 * named person. This page is for the other case, which is most of them: a room
 * of people, five minutes of their attention, and a projector.
 */
export default async function InvitePeoplePage() {
  const viewer = await requireTier("T3_ADMIN");
  const origin = await appOrigin();

  const [links, departments] = await Promise.all([
    db.inviteLink.findMany({
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      include: {
        department: { select: { name: true } },
        createdBy: { select: { name: true, nickname: true } },
      },
      take: 60,
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const live = links.filter((link) => joinLinkStatus(link) === "ok");
  const dead = links.filter((link) => joinLinkStatus(link) !== "ok");

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Invite people"
        subtitle="One link and one code the whole team can use, instead of sixty separate invites."
        action={
          <Link href="/admin" className="hs-btn hs-btn-ghost">
            Back to admin
          </Link>
        }
      />

      <Banner tone="info">
        A join link is a key: anyone holding it who has a{" "}
        <strong>school email address</strong> can make an account. That is the point of it, and it
        is why a link can never grant more than {TIER_LABEL[JOIN_LINK_MAX_TIER]}, why every use is
        counted, and why switching one off kills every copy of the poster at once. For one named
        person, send a personal invite from the admin page instead.
      </Banner>

      {live.length === 0 ? (
        <EmptyState
          title="No join link yet"
          hint="Make one below. It takes about fifteen seconds and works on the next slide you put up."
        />
      ) : (
        <div className="space-y-4">
          {live.map((link) => {
            const url = `${origin}/join/${link.code}`;

            return (
              <Card key={link.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <QrCode value={url} size={168} title={`Join link: ${link.label}`} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="hs-h2 min-w-0 truncate">{link.label}</h2>
                      <span className="hs-pill bg-ok-soft text-ok-strong">Live</span>
                    </div>

                    <p className="mt-1 text-xs text-muted">
                      Joins as {TIER_LABEL[link.tier]}
                      {link.roleTitle ? ` · ${link.roleTitle}` : ""} ·{" "}
                      {link.department?.name ?? "no team"}
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      {usesLabel(link)} ·{" "}
                      {link.expiresAt ? `expires ${formatDateLong(link.expiresAt)}` : "no expiry"} ·
                      made by {link.createdBy.nickname || link.createdBy.name}
                    </p>

                    <code className="mt-3 block truncate rounded-lg bg-surface-2 px-2.5 py-2 text-xs text-muted">
                      {url}
                    </code>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <CopyLink path={`/join/${link.code}`} label="Copy join link" />
                      <Link
                        href={`/admin/invite/${link.id}`}
                        className="hs-btn hs-btn-secondary px-3 py-1.5 text-xs"
                      >
                        Open the poster
                      </Link>
                      <form
                        action={async () => {
                          "use server";
                          await revokeJoinLink(link.id);
                        }}
                      >
                        <button type="submit" className="hs-btn hs-btn-ghost px-3 py-1.5 text-xs">
                          Switch it off
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <SectionTitle>Make a join link</SectionTitle>
        <p className="mb-4 -mt-2 text-sm text-muted">
          Name it after where it is going, so a link you find in six weeks still tells you who has
          it. Everything else has a working default.
        </p>
        <JoinLinkForm
          departments={departments.map((d) => ({ id: d.id, name: d.name, slug: d.slug }))}
        />
      </Card>

      {dead.length > 0 ? (
        <Card>
          <SectionTitle>Switched off, expired or full</SectionTitle>
          <ul className="space-y-2">
            {dead.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{link.label}</p>
                  <p className="text-xs text-faint">
                    {usesLabel(link)} · made by {link.createdBy.nickname || link.createdBy.name} ·{" "}
                    {formatDateLong(link.createdAt)}
                  </p>
                </div>
                <span className="hs-pill bg-neutral-soft text-neutral-strong">
                  {joinLinkStatus(link) === "revoked"
                    ? "Switched off"
                    : joinLinkStatus(link) === "expired"
                      ? "Expired"
                      : "Full"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-xs text-faint">
        Signed in as {viewer.nickname || viewer.name}. Every link made, used or switched off is in
        the <Link href="/admin/audit" className="font-semibold text-brand-deep">audit log</Link>.
      </p>
    </div>
  );
}
