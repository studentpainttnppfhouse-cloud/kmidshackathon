import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/brand";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password · Hackathon Studio" };

export default async function ResetPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const reset = await db.passwordReset.findUnique({ where: { code } });

  if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
    return (
      <AuthShell title="This reset link has expired">
        <p className="text-sm leading-relaxed text-muted">
          Reset links are one-time and last 48 hours. Ask the portal owner to
          generate a new one from the admin panel.
        </p>
        <Link href="/login" className="hs-btn hs-btn-secondary mt-4 w-full">
          Go to sign-in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="One-time reset link">
      <ResetForm code={reset.code} />
    </AuthShell>
  );
}
