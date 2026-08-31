import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/brand";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Accept invite · Hackathon Studio" };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invite = await db.invite.findUnique({
    where: { code },
    include: { department: true, invitedBy: { select: { name: true, nickname: true } } },
  });

  const invalid =
    !invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt.getTime() < Date.now();

  if (invalid) {
    return (
      <AuthShell title="This link has expired" subtitle="Invites are valid for 14 days">
        <p className="text-sm leading-relaxed text-muted">
          {invite?.acceptedAt
            ? "This invite has already been used. If that was you, just sign in."
            : "Ask a department head or an admin to send you a fresh invite link."}
        </p>
        <Link href="/login" className="hs-btn hs-btn-secondary mt-4 w-full">
          Go to sign-in
        </Link>
      </AuthShell>
    );
  }

  const inviter = invite.invitedBy.nickname || invite.invitedBy.name;

  return (
    <AuthShell
      title="Set up your account"
      subtitle={
        invite.department
          ? `${inviter} added you to ${invite.department.name}`
          : `${inviter} invited you to the staff portal`
      }
      footer={<>Already set up? <Link href="/login" className="font-semibold text-brand-deep">Sign in</Link></>}
    >
      <InviteForm code={invite.code} email={invite.email} suggestedName={invite.name ?? ""} />
    </AuthShell>
  );
}
