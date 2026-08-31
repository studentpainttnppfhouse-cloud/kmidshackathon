import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/authorize";
import { revokeSession } from "@/lib/actions/admin";
import { ProfileForm } from "@/components/profile-form";
import { PasswordForm } from "@/components/password-form";
import { Banner, Card, SectionTitle, TierPill } from "@/components/ui";
import { formatDateLong, timeAgo } from "@/lib/dates";
import { decryptField } from "@/lib/crypto";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await requireViewer();

  const sessions = await db.session.findMany({
    where: { userId: viewer.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="hs-eyebrow">Account</p>
        <h1 className="hs-h1">Your profile</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted">
          {viewer.email}
          <TierPill tier={viewer.tier} />
        </p>
      </header>

      <Card>
        <SectionTitle>Profile</SectionTitle>
        <ProfileForm
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
      </Card>

      <Card>
        <SectionTitle>Signed-in devices</SectionTitle>
        <Banner tone="info">
          Your sign-in lives in the database, not in a cookie signature. Portal
          updates, redeploys and restarts all leave it alone — you sign in once
          per device and stay signed in for six months of use.
        </Banner>

        <ul className="mt-4 space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {s.userAgent?.slice(0, 60) ?? "Unknown device"}
                </p>
                <p className="text-xs text-faint">
                  Last used {timeAgo(s.lastSeenAt)} · expires {formatDateLong(s.expiresAt)}
                </p>
              </div>
              <form
                action={async () => {
                  "use server";
                  await revokeSession(s.id);
                }}
              >
                <button type="submit" className="hs-btn hs-btn-danger px-3 py-1.5 text-xs">
                  Sign out this device
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle>Password</SectionTitle>
        <PasswordForm />
      </Card>
    </div>
  );
}
