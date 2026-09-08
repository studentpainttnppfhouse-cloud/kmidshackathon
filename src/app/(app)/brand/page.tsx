import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireViewer, can } from "@/lib/authorize";
import { deleteBrandToken } from "@/lib/actions/brand";
import { assetLinks } from "@/lib/attachment-access";
import { ColorForm, FontForm, RampForm } from "@/components/brand-forms";
import { ConfirmDelete } from "@/components/confirm-delete";
import { CopyButton } from "@/components/chrome";
import {
  Card,
  Divider,
  Ecg,
  EmptyState,
  LastUpdated,
  PageHeader,
  SectionTitle,
} from "@/components/ui";

export const metadata: Metadata = { title: "Brand Kit" };
export const dynamic = "force-dynamic";

/**
 * The colours the portal itself is built from.
 *
 * These stay in code because they *are* the code — changing `--color-brand`
 * from the portal would mean the portal restyling itself, which is a different
 * feature with a much larger blast radius. They are shown here as the starting
 * point, and everything a T3 adds sits alongside them.
 */
const CORE_PALETTE = [
  { name: "Primary pink", hex: "#EC4899", note: "Buttons, active states, the ECG line" },
  { name: "Deep pink", hex: "#BE185D", note: "Headings and emphasis" },
  { name: "Pink wash", hex: "#FDF2F8", note: "Page background (light)" },
  { name: "Surface", hex: "#FFFFFF", note: "Cards and sheets" },
  { name: "Body text", hex: "#1F2937", note: "All running text" },
  { name: "Muted", hex: "#64748B", note: "Secondary text" },
  { name: "Success", hex: "#22C55E", note: "Done, approved" },
  { name: "Warning", hex: "#F59E0B", note: "Needs review" },
  { name: "Danger", hex: "#DC2626", note: "Overdue, incidents" },
  { name: "Dark ground", hex: "#17121A", note: "Page background (dark mode)" },
  { name: "Dark surface", hex: "#201A24", note: "Cards in dark mode" },
  { name: "Dark pink", hex: "#F472B6", note: "Brand pink, lifted for dark mode" },
];

const TYPE_SCALE = [
  { label: "Display", size: "34px", weight: 800 },
  { label: "Heading", size: "24px", weight: 700 },
  { label: "Subheading", size: "17px", weight: 700 },
  { label: "Body", size: "15px", weight: 400 },
  { label: "Caption", size: "12px", weight: 600 },
];

export default async function BrandPage() {
  const viewer = await requireViewer();

  const [assets, tokens] = await Promise.all([
    db.fileAsset.findMany({
      where: { deletedAt: null, isBrandKit: true },
      include: { department: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.brandToken.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] }),
  ]);

  const assetHrefs = await assetLinks(assets);

  const canEdit = can(viewer, "manage_departments", { kind: "system" });

  const colors = tokens.filter((t) => t.kind === "color");
  const fonts = tokens.filter((t) => t.kind === "font");
  const lastChanged = tokens.reduce<Date | null>(
    (latest, token) => (latest === null || token.updatedAt > latest ? token.updatedAt : latest),
    null,
  );

  // Grouped so a 20-shade ramp reads as one scheme rather than twenty entries.
  const groups = new Map<string, typeof colors>();
  for (const color of colors) {
    const key = color.groupName ?? "Ungrouped";
    groups.set(key, [...(groups.get(key) ?? []), color]);
  }

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Brand Kit"
        title="Hackathon Studio — Brand Kit 2027"
        subtitle="So nobody has to ask “what pink again?”"
        action={
          <a href="/brand/export" className="hs-btn hs-btn-secondary hs-no-print">
            Export as PDF
          </a>
        }
      />

      <Card>
        <SectionTitle
          action={<span className="text-xs text-faint">{CORE_PALETTE.length} colours</span>}
        >
          Core palette
        </SectionTitle>
        <p className="mb-4 -mt-2 text-sm text-muted">
          What the portal itself is built from. These live in the stylesheet — everything below is
          added from this page.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {CORE_PALETTE.map((color) => (
            <Swatch key={color.hex} name={color.name} hex={color.hex} note={color.note} />
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle
          action={<span className="text-xs text-faint">{colors.length} added</span>}
        >
          Team palette
        </SectionTitle>

        {colors.length === 0 ? (
          <EmptyState
            title="No colours added yet"
            hint={
              canEdit
                ? "Add one below, or generate a full ramp from a single hex."
                : "An admin can add the team's colours here."
            }
          />
        ) : (
          <div className="space-y-5">
            {[...groups.entries()].map(([group, list]) => (
              <div key={group}>
                <h3 className="hs-eyebrow mb-2">{group}</h3>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {list.map((color) => (
                    <Swatch
                      key={color.id}
                      name={color.name}
                      hex={color.value}
                      note={color.note ?? ""}
                      remove={
                        canEdit ? (
                          <ConfirmDelete
                            action={async () => {
                              "use server";
                              await deleteBrandToken(color.id);
                            }}
                            label="Remove"
                            title={`Remove ${color.name}?`}
                            className="hs-btn hs-btn-ghost px-2 py-1 text-[11px] text-danger-strong"
                          />
                        ) : null
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {canEdit ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionTitle>Add a colour</SectionTitle>
            <ColorForm />
          </Card>
          <Card>
            <SectionTitle>Generate a scheme</SectionTitle>
            <RampForm />
          </Card>
        </div>
      ) : null}

      <Card>
        <SectionTitle>Typography</SectionTitle>
        <div className="space-y-3">
          {TYPE_SCALE.map((type) => (
            <div
              key={type.label}
              className="flex items-baseline gap-4 border-b border-line pb-3 last:border-0"
            >
              <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-faint">
                {type.label}
              </span>
              <span
                className="truncate text-ink"
                style={{ fontSize: type.size, fontWeight: type.weight, letterSpacing: "-0.01em" }}
              >
                KMIDS Hackathon 2027
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">
                {type.size} · {type.weight}
              </span>
            </div>
          ))}
        </div>

        {fonts.length > 0 ? (
          <>
            <Divider />
            <h3 className="hs-eyebrow mb-3">Team fonts</h3>
            <ul className="space-y-2">
              {fonts.map((font) => (
                <li
                  key={font.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">{font.name}</p>
                    <p
                      className="truncate text-lg text-ink"
                      // A font-family only, restricted by the server schema to
                      // characters that cannot terminate the declaration.
                      style={{ fontFamily: font.value.replace(/["';{}]/g, "") }}
                    >
                      KMIDS Hackathon 2027
                    </p>
                    <p className="font-mono text-[11px] text-faint">{font.value}</p>
                    {font.note ? <p className="text-xs text-muted">{font.note}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <CopyButton value={font.value} label="Copy stack" />
                    {canEdit ? (
                      <ConfirmDelete
                        action={async () => {
                          "use server";
                          await deleteBrandToken(font.id);
                        }}
                        label="Remove"
                        title={`Remove ${font.name}?`}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>

      {canEdit ? (
        <Card>
          <SectionTitle>Add a font</SectionTitle>
          <FontForm />
        </Card>
      ) : null}

      <Card>
        <SectionTitle>The ECG motif</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          A heartbeat line runs through the identity: section dividers, loading states, progress. It
          is the one piece of decoration in the system, so it stays thin, pink, and never louder
          than the content next to it.
        </p>
        <div className="rounded-xl bg-tint p-6 text-brand">
          <Ecg className="w-full" />
        </div>
        <Divider />
        <ul className="space-y-1.5 text-sm text-muted">
          <li>· Stroke width 2.5, round caps, always a single continuous path</li>
          <li>· Pink on white, or white on pink — and lifted to #F472B6 in dark mode</li>
          <li>· Animation is decoration: it stops under prefers-reduced-motion</li>
          <li>· Corners are 8–16px. Dividers are 1px. Nothing is navy.</li>
        </ul>
      </Card>

      <Card>
        <SectionTitle
          action={
            <Link href="/files/new" className="text-sm font-semibold text-brand-deep">
              Add an asset
            </Link>
          }
        >
          Logos, templates & assets
        </SectionTitle>
        {assets.length === 0 ? (
          <EmptyState
            title="No brand assets yet"
            hint='Add them from Files & Assets and tick "Show this in the Brand Kit".'
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => {
              const link = assetHrefs.get(asset.id);

              return (
                <a
                  key={asset.id}
                  href={link?.href ?? "#"}
                  {...(link?.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                  className="rounded-xl border border-line p-3 transition hover:border-brand"
                >
                  <span className="hs-pill bg-tint text-brand-deep">{asset.kind}</span>
                  <span className="mt-1.5 block text-sm font-bold text-ink">
                    {asset.name}
                    {link?.external ? " ↗" : ""}
                  </span>
                  <span className="block text-[11px] text-faint">{asset.department.name}</span>
                </a>
              );
            })}
          </div>
        )}
      </Card>

      <LastUpdated at={lastChanged} label="Palette last changed" />
    </div>
  );
}

function Swatch({
  name,
  hex,
  note,
  remove,
}: {
  name: string;
  hex: string;
  note: string;
  remove?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div
        className="mb-2 h-14 rounded-lg border border-line"
        style={{ background: hex }}
        aria-hidden="true"
      />
      <p className="text-sm font-bold text-ink">{name}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs text-brand-deep">{hex}</p>
        <CopyButton value={hex} label="Copy" className="hs-btn hs-btn-ghost px-2 py-0.5 text-[11px]" />
      </div>
      {note ? <p className="mt-0.5 text-[11px] text-faint">{note}</p> : null}
      {remove ? <div className="mt-1.5">{remove}</div> : null}
    </div>
  );
}
