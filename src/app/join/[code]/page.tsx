import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/brand";
import { TIER_LABEL } from "@/lib/constants";
import { joinLinkMessage, joinLinkStatus } from "@/lib/join-links";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join the team · Hackathon Studio" };
export const dynamic = "force-dynamic";

/**
 * The page a QR code points at.
 *
 * It has to work on a phone held up at the back of a room, on the school
 * Wi-Fi, on the first try — so it is one card, four fields, and no step in
 * between scanning and having an account. `force-dynamic` because the link's
 * remaining uses are checked here and a cached "this link works" from ten
 * minutes ago is exactly the wrong answer.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const link = await db.inviteLink.findUnique({
    where: { code },
    include: {
      department: { select: { name: true } },
      createdBy: { select: { name: true, nickname: true } },
    },
  });

  const status = joinLinkStatus(link);

  if (status !== "ok" || !link) {
    return (
      <AuthShell title="This link will not work" subtitle="Join links can be switched off or run out">
        <p className="text-sm leading-relaxed text-muted">{joinLinkMessage(status)}</p>
        <Link href="/login" className="hs-btn hs-btn-secondary mt-4 w-full">
          Go to sign-in
        </Link>
      </AuthShell>
    );
  }

  const inviter = link.createdBy.nickname || link.createdBy.name;

  return (
    <AuthShell
      title="Join the staff portal"
      subtitle={
        link.department
          ? `${inviter} opened this link for ${link.department.name}`
          : `${inviter} opened this link for KMIDS Hackathon 2027`
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-deep">
            Sign in
          </Link>
        </>
      }
    >
      <div className="mb-4 rounded-xl border border-line bg-tint/60 p-3">
        <p className="hs-eyebrow mb-1">What you get</p>
        <p className="text-xs text-muted">
          {TIER_LABEL[link.tier]}
          {link.roleTitle ? ` · ${link.roleTitle}` : ""}
          {link.department ? ` · ${link.department.name}` : " · no team yet"}. An admin can change
          any of it later.
        </p>
      </div>

      <JoinForm code={link.code} />
    </AuthShell>
  );
}
