import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isAdmin, requireViewer } from "@/lib/authorize";
import { revokeSession } from "@/lib/actions/admin";
import { pageMatrix } from "@/lib/page-access";
import { ProfileForm } from "@/components/profile-form";
import { PasswordForm } from "@/components/password-form";
import { AccessGrid } from "@/components/access-grid";
import { AiSettings } from "@/components/ai-settings";
import { Faq } from "@/components/chrome";
import { Card, SectionTitle, TierPill } from "@/components/ui";
import { TIER_BLURB, TIER_LABEL, TIER_ORDER } from "@/lib/constants";
import { formatDateLong, timeAgo } from "@/lib/dates";
import { decryptField } from "@/lib/crypto";
import type { Tier } from "@prisma/client";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "account", label: "Profile & account" },
  { key: "access", label: "Page access" },
  { key: "integrations", label: "Integrations" },
  { key: "danger", label: "Danger zone" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TIERS = (Object.keys(TIER_ORDER) as Tier[]).sort((a, b) => TIER_ORDER[a] - TIER_ORDER[b]);

async function signOutEverywhere() {
  "use server";
  const viewer = await requireViewer();
  await db.session.updateMany({
    where: { userId: viewer.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit(viewer.id, "session.revoked.all", {
    type: "user",
    id: viewer.id,
    detail: "Signed out of every device from Settings",
  });
  redirect("/login");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "account";
  const canEditAccess = isAdmin(viewer);

  return (
    <div className="space-y-5">
      <header>
        <p className="hs-eyebrow">Settings</p>
        <h1 className="hs-h1">Settings</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted">
          {viewer.email}
          <TierPill tier={viewer.tier} />
        </p>
      </header>

      <nav aria-label="Settings sections" className="flex flex-wrap gap-1.5 border-b border-line pb-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/settings?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`hs-btn px-3 py-1.5 text-sm ${
              tab === t.key ? "hs-btn-primary" : "hs-btn-ghost"
            } ${t.key === "danger" && tab !== t.key ? "text-red-600" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "account" ? <AccountSection viewerId={viewer.id} viewer={viewer} /> : null}
      {tab === "access" ? <AccessSection canEdit={canEditAccess} /> : null}
      {tab === "integrations" ? (
        <section id="integrations" aria-labelledby="integrations-title" className="space-y-5">
          <Card>
            <SectionTitle>
              <span id="integrations-title">Integrations</span>
            </SectionTitle>
            {/* INTEGRATIONS SLOT: the Gemini API key form is added here by the integrations workstream. */}
            <p className="text-sm text-faint">No integrations configured yet.</p>
          </Card>
          <AiSettings viewer={viewer} />
        </section>
      ) : null}
      {tab === "danger" ? <DangerSection /> : null}
    </div>
  );
}

async function AccountSection({
  viewerId,
  viewer,
}: {
  viewerId: string;
  viewer: Awaited<ReturnType<typeof requireViewer>>;
}) {
  const sessions = await db.session.findMany({
    where: { userId: viewerId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });

  return (
    <section id="account" className="space-y-5">
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
        <SectionTitle>Password</SectionTitle>
        <PasswordForm />
      </Card>

      <Card>
        <SectionTitle>Signed-in devices</SectionTitle>
        <ul className="space-y-2">
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
    </section>
  );
}

async function AccessSection({ canEdit }: { canEdit: boolean }) {
  const matrix = await pageMatrix();

  return (
    <section id="access" className="space-y-5">
      <Card>
        <SectionTitle>Pages &amp; tiers</SectionTitle>
        <AccessGrid matrix={matrix} readOnly={!canEdit} />
      </Card>

      <Card>
        <SectionTitle>What each tier can do</SectionTitle>
        <ul className="space-y-2">
          {TIERS.map((tier) => (
            <li key={tier} className="rounded-xl border border-line p-3">
              <p className="text-sm font-bold text-ink">{TIER_LABEL[tier]}</p>
              <p className="mt-0.5 text-sm text-muted">{TIER_BLURB[tier]}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle>Access questions</SectionTitle>
        <Faq
          items={[
            {
              q: "Why can't I open a page?",
              a: "Each page is switched on or off per tier. If a page is missing from your menu or bounces you to the dashboard, it is turned off for your tier. Ask an admin or the owner.",
            },
            {
              q: "Does page access give me extra powers?",
              a: "No. Page access can only take access away. A tier set to Full on a page still does only what its role allows: members with Full on Announcements still cannot broadcast.",
            },
            {
              q: "Can I see other departments' work?",
              a: "Yes, reading across departments is deliberate. Writing is different: you edit inside your own department, and approving or reassigning is your head's job.",
            },
            {
              q: "Which cells are locked?",
              a: "The owner cannot be shut out of anything, the dashboard and settings cannot be hidden from anybody, and nobody below Admin can be let into the accounts screen or the audit log.",
            },
            {
              q: "Who can change page access?",
              a: "Admins and the owner. Every change is recorded in the audit log.",
            },
          ]}
        />
      </Card>
    </section>
  );
}

function DangerSection() {
  return (
    <section id="danger" className="space-y-5">
      <Card>
        <SectionTitle>Danger zone</SectionTitle>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Sign out of every device</p>
            <p className="text-xs text-faint">Including this one. You will need your password again.</p>
          </div>
          <form action={signOutEverywhere}>
            <button type="submit" className="hs-btn hs-btn-danger px-3 py-1.5 text-xs">
              Sign out everywhere
            </button>
          </form>
        </div>
      </Card>
    </section>
  );
}
