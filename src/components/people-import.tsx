"use client";

import { useActionState } from "react";
import { importPeople, type ImportResult } from "@/lib/actions/people";
import { Feedback, SubmitButton } from "@/components/form-bits";
import { TIER_LABEL } from "@/lib/constants";
import type { Tier } from "@prisma/client";

const initial: ImportResult = {};
const TIERS: Tier[] = ["T0_ADVISOR", "T1_MEMBER", "T2_HEAD", "T3_ADMIN"];

const EXAMPLE = `email,name,tier,department,role
napat@kmids.ac.th,Napat Sirichai,T2_HEAD,sponsorship,Head of Sponsorship
mint@kmids.ac.th,Mint Chaiyaporn,T1_MEMBER,social,Content
june@kmids.ac.th,June Prasert,,operations,`;

export function PeopleImport({ departmentSlugs }: { departmentSlugs: string[] }) {
  const [state, action] = useActionState(importPeople, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="hs-label" htmlFor="import-rows">
          Paste rows — one person per line
        </label>
        <textarea
          id="import-rows"
          name="rows"
          rows={10}
          required
          className="hs-input resize-y font-mono text-[0.8125rem]"
          placeholder={EXAMPLE}
          spellCheck={false}
        />
        <p className="mt-1.5 text-xs text-faint">
          Columns: <code>email, name, tier, department, role</code>. Only the email is required —
          everything after it can be blank. A header row is fine; it is ignored. Copying straight
          out of a spreadsheet works.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="import-tier">
            Tier for rows that do not name one
          </label>
          <select id="import-tier" name="defaultTier" defaultValue="T1_MEMBER" className="hs-input">
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {TIER_LABEL[tier]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="hs-label">Department names it recognises</p>
          <p className="text-xs text-muted">
            {departmentSlugs.length > 0 ? departmentSlugs.join(", ") : "None set up yet."}
          </p>
        </div>
      </div>

      <p className="rounded-[10px] bg-tint/60 px-3 py-2.5 text-xs text-muted">
        This creates <strong>invites</strong>, not accounts. Nobody is signed in by importing them —
        each person still picks their own password from their own link. Copy the links from Pending
        invites above.
      </p>

      <Feedback state={state} />

      {state.skipped && state.skipped.length > 0 ? (
        <div className="rounded-[10px] border border-warn-edge bg-warn-soft/60 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-warn-strong">
            {state.skipped.length} row{state.skipped.length === 1 ? "" : "s"} skipped
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-warn-strong">
            {state.skipped.map((row) => (
              <li key={`${row.line}-${row.email}`}>
                Line {row.line} — {row.email || "(no email)"}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Importing…">
        Create invites
      </SubmitButton>
    </form>
  );
}
