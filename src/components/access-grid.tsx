"use client";

import { useState, useTransition } from "react";
import { setPageAccess } from "@/lib/actions/page-access";
import { TIER_BLURB, TIER_LABEL } from "@/lib/constants";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_BLURB,
  ACCESS_LEVEL_LABEL,
  PORTAL_PAGES,
  TIERS,
  accessBounds,
  type PageKey,
} from "@/lib/pages";
import type { PageAccessLevel, Tier } from "@prisma/client";
import type { PageMatrix } from "@/lib/page-access";

/**
 * The page-by-tier grid.
 *
 * A table of selects rather than anything cleverer. Sixteen pages times five
 * tiers is eighty cells, and eighty of anything is only readable if every one
 * of them looks the same and says what it is in words — a colour-coded matrix
 * of icons would be prettier and would need a legend nobody reads to answer the
 * one question the screen exists for: can a member open the audit log.
 *
 * Each cell saves on change. There is no Save button because there is no draft:
 * one cell is one decision, and batching eighty of them behind a button just
 * means losing them all to a closed tab.
 */
export function AccessGrid({ matrix }: { matrix: PageMatrix }) {
  const [draft, setDraft] = useState(matrix);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  function choose(page: PageKey, tier: Tier, level: PageAccessLevel) {
    setDraft((current) => ({ ...current, [page]: { ...current[page], [tier]: level } }));
    setSaved(`${page}:${tier}`);
    startTransition(() => setPageAccess(page, tier, level));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th
                scope="col"
                className="py-2 pr-3 text-xs font-bold uppercase tracking-wide text-faint"
              >
                Page
              </th>
              {TIERS.map((tier) => (
                <th
                  key={tier}
                  scope="col"
                  title={TIER_BLURB[tier]}
                  className="py-2 pr-3 text-xs font-bold uppercase tracking-wide text-faint"
                >
                  {TIER_LABEL[tier]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PORTAL_PAGES.map((page) => (
              <tr key={page.key} className="border-b border-line/60 align-top">
                <th scope="row" className="py-2.5 pr-3 text-left">
                  <span className="block text-sm font-bold text-ink">
                    {page.label}
                    {page.nav ? null : (
                      // Reached from a link or the search box rather than the
                      // sidebar, so "hidden" here means something different: the
                      // menu never offered it in the first place.
                      <span className="ml-1.5 text-[10px] font-normal text-faint">
                        not in the menu
                      </span>
                    )}
                  </span>
                  <span className="block max-w-[28ch] text-[11px] font-normal text-faint">
                    {page.blurb}
                  </span>
                </th>

                {TIERS.map((tier) => {
                  const bounds = accessBounds(page.key, tier);
                  const fixed = bounds.min === bounds.max;
                  const value = draft[page.key][tier];
                  const justSaved = saved === `${page.key}:${tier}`;

                  return (
                    <td key={tier} className="py-2.5 pr-3">
                      {fixed ? (
                        <span className="text-xs text-faint">
                          {ACCESS_LEVEL_LABEL[bounds.min]}
                          <span className="block text-[10px]">locked</span>
                        </span>
                      ) : (
                        <>
                          <label className="sr-only" htmlFor={`pa-${page.key}-${tier}`}>
                            {page.label} for {TIER_LABEL[tier]}
                          </label>
                          <select
                            id={`pa-${page.key}-${tier}`}
                            className="hs-input py-1 text-xs"
                            value={value}
                            disabled={pending}
                            title={ACCESS_LEVEL_BLURB[value]}
                            onChange={(event) =>
                              choose(page.key, tier, event.target.value as PageAccessLevel)
                            }
                          >
                            {ACCESS_LEVELS.filter(
                              (level) => !(level === "NONE" && bounds.min !== "NONE"),
                            ).map((level) => (
                              <option key={level} value={level}>
                                {ACCESS_LEVEL_LABEL[level]}
                              </option>
                            ))}
                          </select>
                          {justSaved ? (
                            <span className="mt-0.5 block text-[10px] text-faint">
                              {pending ? "Saving…" : "Saved"}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="grid gap-1.5 rounded-xl border border-line bg-tint/40 p-3 text-xs sm:grid-cols-2">
        {ACCESS_LEVELS.map((level) => (
          <div key={level} className="flex gap-2">
            <dt className="w-20 shrink-0 font-bold text-ink">{ACCESS_LEVEL_LABEL[level]}</dt>
            <dd className="min-w-0 text-muted">{ACCESS_LEVEL_BLURB[level]}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-faint">
        Locked cells are the two things this grid will not do: the owner cannot be shut out of the
        portal, the dashboard and settings cannot be hidden from anybody, and nobody below T3 Admin
        can be let into the accounts screen or the audit log.
      </p>
    </div>
  );
}
