"use client";

import { useState, useTransition } from "react";
import { setPageAccess } from "@/lib/actions/page-access";
import { TIER_LABEL } from "@/lib/constants";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_BLURB,
  ACCESS_LEVEL_LABEL,
  ACCESS_LEVEL_SHORT,
  PAGE_BY_KEY,
  TIERS,
  accessBounds,
  type PageKey,
} from "@/lib/pages";
import type { PageAccessLevel, Tier } from "@prisma/client";

/**
 * Who can use this page — asked and answered on the page itself.
 *
 * The full grid lives at /admin/access and is the right screen for planning the
 * season. This is the other half: the owner is *on* the announcements page,
 * decides right then that members should stop being able to post, and changes
 * it without leaving. The thing being configured is in front of them, which is
 * the difference between a settings screen people use and one they avoid.
 *
 * Collapsed by default and rendered for T4 alone, so for everybody else it is
 * not a strip of chrome above every page — it does not exist.
 */
export function PageAccessBar({
  page,
  row,
}: {
  page: PageKey;
  row: Record<Tier, PageAccessLevel>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(row);
  const [pending, startTransition] = useTransition();

  const meta = PAGE_BY_KEY[page];

  function choose(tier: Tier, level: PageAccessLevel) {
    // Moved locally first so the row does not sit on the old answer for the
    // length of a round trip. The server clamps whatever arrives, and the page
    // revalidates behind this, so a rejected value corrects itself.
    setDraft((current) => ({ ...current, [tier]: level }));
    startTransition(() => setPageAccess(page, tier, level));
  }

  const hidden = TIERS.filter((tier) => draft[tier] === "NONE");

  return (
    <section className="hs-no-print mb-4 rounded-2xl border border-line bg-tint/40 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted">
          <span className="font-bold text-ink">Access</span> <span aria-hidden="true">·</span>{" "}
          {hidden.length === 0
            ? "every tier can open this page"
            : `hidden from ${hidden.map((tier) => TIER_LABEL[tier]).join(", ")}`}
        </p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="hs-btn hs-btn-ghost px-2.5 py-1 text-xs"
        >
          {open ? "Close" : "Who can use this page"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <p className="text-xs text-muted">{meta.blurb}</p>

          {TIERS.map((tier) => {
            const bounds = accessBounds(page, tier);
            const fixed = bounds.min === bounds.max;

            return (
              <div key={tier} className="flex flex-wrap items-center gap-2">
                <span className="w-28 shrink-0 text-xs font-bold text-ink">{TIER_LABEL[tier]}</span>

                {fixed ? (
                  <span className="text-xs text-faint">
                    {tier === "T4_OWNER"
                      ? "Always full access — the owner cannot be locked out."
                      : `Always ${ACCESS_LEVEL_LABEL[bounds.min].toLowerCase()} on this page.`}
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1" role="group" aria-label={TIER_LABEL[tier]}>
                    {ACCESS_LEVELS.filter(
                      (level) => !(level === "NONE" && bounds.min !== "NONE"),
                    ).map((level) => {
                      const active = draft[tier] === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          disabled={pending}
                          onClick={() => choose(tier, level)}
                          aria-pressed={active}
                          title={ACCESS_LEVEL_BLURB[level]}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                            active
                              ? "bg-brand-solid text-on-brand"
                              : "bg-surface text-muted hover:text-brand-deep"
                          }`}
                        >
                          {ACCESS_LEVEL_SHORT[level]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <p className="pt-1 text-[11px] text-faint">
            Full means whatever that tier&rsquo;s role already allows here, never more. Reply covers
            comments and answering a form. Saved as you click.
          </p>
        </div>
      ) : null}
    </section>
  );
}
