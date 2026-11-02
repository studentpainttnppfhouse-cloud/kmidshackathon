import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/brand";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Account help · Hackathon Studio" };

export default function ForgotPage() {
  return (
    <AuthShell
      title="Account help"
      subtitle="An admin will check and send you a reset link"
      footer={
        <Link href="/login" className="font-semibold text-brand-deep">
          ← Back to sign in
        </Link>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
