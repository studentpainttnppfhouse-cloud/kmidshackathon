import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/session";
import { AuthShell } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Hackathon Studio" };

export default async function LoginPage() {
  // Already signed in? Never make somebody sign in twice.
  const viewer = await getViewer();
  if (viewer) redirect("/dashboard");

  return (
    <AuthShell
      title="Staff sign-in"
      subtitle="KMIDS Hackathon 2027"
      footer={
        <>
          No account yet? The portal is invite-only — ask your department head
          or an admin to send you a link.
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
