import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/session";
import { Logo } from "@/components/brand";
import { Ecg } from "@/components/ui";
import { ProfileForm } from "@/components/profile-form";
import { decryptField } from "@/lib/crypto";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profileCompletedAt) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-brand-wash px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={54} />
          <div>
            <h1 className="hs-h1">Welcome to Hackathon Studio</h1>
            <p className="mt-1 text-sm text-muted">
              One quick setup, then you are in for good. Signed in as{" "}
              <span className="font-semibold text-brand-deep">{viewer.email}</span>
            </p>
          </div>
          <Ecg className="w-28 text-brand/40" />
        </div>

        <div className="hs-card p-6">
          <ProfileForm
            submitLabel="Finish setup"
            defaults={{
              nickname: viewer.nickname,
              grade: viewer.grade,
              phone: decryptField(viewer.phone),
              lineId: decryptField(viewer.lineId),
              shirtSize: viewer.shirtSize,
              roleTitle: viewer.roleTitle,
              avatarUrl: viewer.avatarUrl,
            }}
          />
        </div>
      </div>
    </main>
  );
}
