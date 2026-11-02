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
/** Workspace sections the grid is grouped into. Unknown pages land in "Other". */
const SECTIONS: { title: string; keys: string[] }[] = [
  { title: "Home", keys: ["dashboard", "notifications", "search"] },
  { title: "Work", keys: ["assignments", "departments", "people", "event", "forms"] },
  { title: "Content", keys: ["documents", "files", "brand", "announcements"] },
  { title: "Administration", keys: ["admin", "audit"] },
  { title: "Account", keys: ["settings", "help"] },
];

function groupPages() {
  const used = new Set<string>();
  const groups = SECTIONS.map((section) => {
    const pages = PORTAL_PAGES.filter((p) => section.keys.includes(p.key));
    pages.forEach((p) => used.add(p.key));
    return { title: section.title, pages };
  });
  const rest = PORTAL_PAGES.filter((p) => !used.has(p.key));
  if (rest.length) groups.push({ title: "Other", pages: rest });
  return groups.filter((g) => g.pages.length > 0);
}

export function AccessGrid({
  matrix,
  readOnly = false,
}: {
  matrix: PageMatrix;
  /** Shown to people who may look but not change anything. */
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(matrix);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const groups = groupPages();

  function choose(page: PageKey, tier: Tier, level: PageAccessLevel) {
    if (readOnly) return;
    setDraft((current) => ({ ...current, [page]: { ...current[page], [tier]: level } }));
    setSaved(`${page}:${tier}`);
    startTransition(() => setPageAccess(page, tier, level));
  }

  return (
    <div className="space-y-3">
      {readOnly ? (
        <p className="text-xs text-faint">Read-only. Only admins and the owner can change access.</p>
      ) : null}
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
          {groups.map((group) => (
            <tbody key={group.title}>
              <tr>
                <th
                  colSpan={TIERS.length + 1}
                  scope="colgroup"
                  className="bg-tint/40 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-brand-deep"
                >
                  {group.title}
                </th>
              </tr>
              {group.pages.map((page) => (
                <tr key={page.key} className="border-b border-line/60 align-middle">
                  <th scope="row" className="py-2 pr-3 text-left">
                    <span className="block text-sm font-bold text-ink">
                      {page.label}
                      {page.nav ? null : (
                        <span className="ml-1.5 text-[10px] font-normal text-faint">
                          not in the menu
                        </span>
                      )}
                    </span>
                  </th>

                  {TIERS.map((tier) => {
                    const bounds = accessBounds(page.key, tier);
                    const fixed = bounds.min === bounds.max;
                    const value = draft[page.key]?.[tier] ?? bounds.min;
                    const justSaved = saved === `${page.key}:${tier}`;
                    const on = value !== "NONE";

                    if (fixed || readOnly) {
                      return (
                        <td key={tier} className="py-2 pr-3">
                          <span className={`text-xs ${on ? "text-ink" : "text-faint"}`}>
                            {ACCESS_LEVEL_LABEL[value]}
                            {fixed ? <span className="block text-[10px] text-faint">locked</span> : null}
                          </span>
                        </td>
                      );
                    }

                    const canBeOff = bounds.min === "NONE";
                    return (
                      <td key={tier} className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          {canBeOff ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={`${page.label} for ${TIER_LABEL[tier]}`}
                              disabled={pending}
                              onClick={() =>
                                choose(page.key, tier, on ? "NONE" : "READ")
                              }
                              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                                on ? "bg-brand" : "bg-line"
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                                  on ? "left-[18px]" : "left-0.5"
                                }`}
                              />
                            </button>
                          ) : null}
                          {on ? (
                            <>
                              <label className="sr-only" htmlFor={`pa-${page.key}-${tier}`}>
                                Level for {page.label}, {TIER_LABEL[tier]}
                              </label>
                              <select
                                id={`pa-${page.key}-${tier}`}
                                className="hs-input py-0.5 text-xs"
                                value={value}
                                disabled={pending}
                                title={ACCESS_LEVEL_BLURB[value]}
                                onChange={(event) =>
                                  choose(page.key, tier, event.target.value as PageAccessLevel)
                                }
                              >
                                {ACCESS_LEVELS.filter((level) => level !== "NONE").map((level) => (
                                  <option key={level} value={level}>
                                    {ACCESS_LEVEL_LABEL[level]}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <span className="text-xs text-faint">Hidden</span>
                          )}
                        </div>
                        {justSaved ? (
                          <span className="mt-0.5 block text-[10px] text-faint">
                            {pending ? "Saving…" : "Saved"}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
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
    </div>
  );
}
