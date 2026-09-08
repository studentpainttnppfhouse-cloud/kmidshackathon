import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTier } from "@/lib/authorize";
import { CopyLink } from "@/components/admin-widgets";
import { PrintButton } from "@/components/join-link-widgets";
import { QrCode } from "@/components/qr";
import { Banner } from "@/components/ui";
import { ALLOWED_EMAIL_DOMAIN, TIER_LABEL } from "@/lib/constants";
import { joinLinkMessage, joinLinkStatus, usesLabel } from "@/lib/join-links";
import { appOrigin } from "@/lib/request";
import { formatDateLong } from "@/lib/dates";

export const metadata: Metadata = { title: "Join link poster" };
export const dynamic = "force-dynamic";

/**
 * The thing you actually put on a wall.
 *
 * One code, big enough to scan from the back of a classroom, the URL spelled
 * out underneath for the phone whose camera will not cooperate, and nothing
 * else on the page. The screen version carries the admin controls; the print
 * stylesheet drops every one of them, so what comes out of the printer is the
 * poster and not a screenshot of an admin panel.
 */
export default async function JoinPosterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTier("T3_ADMIN");
  const { id } = await params;
  const origin = await appOrigin();

  const link = await db.inviteLink.findUnique({
    where: { id },
    include: { department: { select: { name: true } } },
  });
  if (!link) notFound();

  const status = joinLinkStatus(link);
  const url = `${origin}/join/${link.code}`;

  return (
    <div className="hs-enter space-y-5">
      <div className="hs-no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/invite" className="text-sm font-semibold text-brand-deep">
          ← All join links
        </Link>
        <div className="flex flex-wrap gap-2">
          <CopyLink path={`/join/${link.code}`} label="Copy join link" />
          <PrintButton label="Print the poster" />
        </div>
      </div>

      {status !== "ok" ? (
        <Banner tone="warn">
          {joinLinkMessage(status)} Printing it will get you a poster nobody can use.
        </Banner>
      ) : null}

      <div className="hs-card mx-auto max-w-[520px] p-8 text-center">
        <p className="hs-eyebrow">KMIDS Hackathon 2027</p>
        <h1 className="hs-h1 mt-1">Join the staff portal</h1>
        <p className="mt-2 text-sm text-muted">
          Scan this with your phone camera. Sign up with your{" "}
          <strong>@{ALLOWED_EMAIL_DOMAIN}</strong> address and you are in.
        </p>

        <div className="mt-6 flex justify-center">
          <QrCode value={url} size={280} title={`Join link: ${link.label}`} className="p-3" />
        </div>

        <p className="mt-5 break-all text-sm font-semibold text-ink">{url}</p>

        <p className="mt-4 text-xs text-faint">
          {link.label} · joins as {TIER_LABEL[link.tier]}
          {link.roleTitle ? ` · ${link.roleTitle}` : ""}
          {link.department ? ` · ${link.department.name}` : ""}
        </p>
      </div>

      <p className="hs-no-print text-center text-xs text-faint">
        {usesLabel(link)} ·{" "}
        {link.expiresAt ? `expires ${formatDateLong(link.expiresAt)}` : "no expiry"}
      </p>
    </div>
  );
}
