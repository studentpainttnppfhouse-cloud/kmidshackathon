import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/authorize";
import { Card, Divider, Ecg, EmptyState, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Brand Kit" };
export const dynamic = "force-dynamic";

const PALETTE = [
  { name: "Primary pink", hex: "#EC4899", note: "Buttons, active states, the ECG line" },
  { name: "Deep pink", hex: "#BE185D", note: "Headings and emphasis" },
  { name: "Pink wash", hex: "#FDF2F8", note: "Page background" },
  { name: "Surface", hex: "#FFFFFF", note: "Cards and sheets" },
  { name: "Body text", hex: "#1F2937", note: "All running text" },
  { name: "Muted", hex: "#64748B", note: "Secondary text" },
  { name: "Success", hex: "#22C55E", note: "Done, approved" },
  { name: "Warning", hex: "#F59E0B", note: "Needs review" },
  { name: "Danger", hex: "#DC2626", note: "Overdue, incidents" },
];

const TYPE_SCALE = [
  { label: "Display", size: "34px", weight: 800 },
  { label: "Heading", size: "24px", weight: 700 },
  { label: "Subheading", size: "17px", weight: 700 },
  { label: "Body", size: "15px", weight: 400 },
  { label: "Caption", size: "12px", weight: 600 },
];

export default async function BrandPage() {
  await requireViewer();

  const assets = await db.fileAsset.findMany({
    where: { deletedAt: null, isBrandKit: true },
    include: { department: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="hs-eyebrow">Brand Kit</p>
        <h1 className="hs-h1">Hackathon Studio — Brand Kit 2027</h1>
        <p className="mt-1 text-sm text-muted">
          So nobody has to ask &ldquo;what pink again?&rdquo;
        </p>
      </header>

      <Card>
        <SectionTitle>Palette</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {PALETTE.map((c) => (
            <div key={c.hex} className="rounded-xl border border-[#f3e3ec] p-3">
              <div
                className="mb-2 h-14 rounded-lg border border-[#f3e3ec]"
                style={{ background: c.hex }}
                aria-hidden="true"
              />
              <p className="text-sm font-bold text-ink">{c.name}</p>
              <p className="font-mono text-xs text-pink-700">{c.hex}</p>
              <p className="mt-0.5 text-[11px] text-faint">{c.note}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Typography — Inter</SectionTitle>
        <div className="space-y-3">
          {TYPE_SCALE.map((t) => (
            <div key={t.label} className="flex items-baseline gap-4 border-b border-[#f8eef3] pb-3 last:border-0">
              <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-faint">
                {t.label}
              </span>
              <span
                className="truncate text-ink"
                style={{ fontSize: t.size, fontWeight: t.weight, letterSpacing: "-0.01em" }}
              >
                KMIDS Hackathon 2027
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">
                {t.size} · {t.weight}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>The ECG motif</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          A heartbeat line runs through the identity: section dividers, loading
          states, progress. It is the one piece of decoration in the system, so
          it stays thin, pink, and never louder than the content next to it.
        </p>
        <div className="rounded-xl bg-pink-50 p-6 text-brand">
          <Ecg className="w-full" />
        </div>
        <Divider />
        <ul className="space-y-1.5 text-sm text-muted">
          <li>· Stroke width 2.5, round caps, always a single continuous path</li>
          <li>· Pink on white, or white on pink — never on a dark background</li>
          <li>· Animation is decoration: it stops under prefers-reduced-motion</li>
          <li>· Corners are 8–16px. Dividers are 1px. Nothing is navy.</li>
        </ul>
      </Card>

      <Card>
        <SectionTitle>Logos, templates & assets</SectionTitle>
        {assets.length === 0 ? (
          <EmptyState
            title="No brand assets linked yet"
            hint='Add them from Files & Assets and tick "Show this in the Brand Kit".'
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((a) => (
              <a
                key={a.id}
                href={a.externalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl border border-[#f3e3ec] p-3 transition hover:border-pink-300"
              >
                <span className="hs-pill bg-pink-50 text-pink-700">{a.kind}</span>
                <span className="mt-1.5 block text-sm font-bold text-ink">{a.name} ↗</span>
                <span className="block text-[11px] text-faint">{a.department.name}</span>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
