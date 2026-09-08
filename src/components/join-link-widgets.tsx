"use client";

import { useActionState, useState } from "react";
import { createJoinLink, type JoinLinkState } from "@/lib/actions/join-links";
import { SubmitButton } from "@/components/submit-button";
import { Feedback } from "@/components/form-bits";
import {
  JOIN_LINK_MAX_USES,
  JOIN_LINK_TTL_DAYS,
  ROLE_OPTIONS,
  TIER_BLURB,
  TIER_LABEL,
  tierForRole,
} from "@/lib/constants";
import type { Tier } from "@prisma/client";

const initial: JoinLinkState = {};

/** The tiers a join link may grant. Mirrors JOIN_LINK_MAX_TIER on the server. */
const TIERS = ["T0_ADVISOR", "T1_MEMBER", "T2_HEAD"] as const satisfies readonly Tier[];

export type JoinDept = { id: string; name: string; slug: string };

/**
 * Making a join link.
 *
 * Everything below the label is optional and has a working default, because the
 * common case is somebody standing in front of a room who wants a code on the
 * projector in the next fifteen seconds. Uses and expiry are the two fields
 * worth the extra thought, so they say what leaving them alone means rather
 * than making you work it out.
 */
export function JoinLinkForm({ departments }: { departments: JoinDept[] }) {
  const [state, action] = useActionState(createJoinLink, initial);

  const [deptId, setDeptId] = useState("");
  const [role, setRole] = useState("");
  const [tier, setTier] = useState<Tier>("T1_MEMBER");
  const [limited, setLimited] = useState(true);
  const [expires, setExpires] = useState(true);

  const slug = departments.find((d) => d.id === deptId)?.slug ?? "";
  // Only the roles a join link may actually grant. A link that offers
  // "Event Director" and then refuses it on submit is a worse form than one
  // that never offered it.
  const roles = ROLE_OPTIONS.filter(
    (option) => option.slug === slug && TIERS.includes(option.tier as (typeof TIERS)[number]),
  );

  const chooseRole = (title: string) => {
    setRole(title);
    const implied = tierForRole(title);
    if (implied && TIERS.includes(implied as (typeof TIERS)[number])) setTier(implied);
  };

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="jl-label">
            What is this link for?
          </label>
          <input
            id="jl-label"
            name="label"
            required
            maxLength={80}
            autoComplete="off"
            className="hs-input"
            placeholder="Staff meeting, 3 Feb"
          />
        </div>

        <div>
          <label className="hs-label" htmlFor="jl-tier">
            Everybody who joins becomes
          </label>
          <select
            id="jl-tier"
            name="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier)}
            className="hs-input"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-faint">{TIER_BLURB[tier]}</p>
        </div>

        <div>
          <label className="hs-label" htmlFor="jl-dept">
            Team
          </label>
          <select
            id="jl-dept"
            name="departmentId"
            value={deptId}
            onChange={(e) => {
              setDeptId(e.target.value);
              setRole("");
            }}
            className="hs-input"
          >
            <option value="">No team yet</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="hs-label" htmlFor="jl-role">
            Role
          </label>
          <select
            id="jl-role"
            name="roleTitle"
            value={role}
            onChange={(e) => chooseRole(e.target.value)}
            disabled={roles.length === 0}
            className="hs-input"
          >
            <option value="">{deptId ? "No role yet" : "Pick a team first"}</option>
            {roles.map((option) => (
              <option key={option.title} value={option.title}>
                {option.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={limited}
              onChange={(e) => setLimited(e.target.checked)}
              className="accent-pink-500"
            />
            Stop after a number of people
          </label>
          {limited ? (
            <input
              name="maxUses"
              type="number"
              min={1}
              max={JOIN_LINK_MAX_USES}
              defaultValue={60}
              aria-label="How many people may use this link"
              className="hs-input mt-2 py-1.5 text-sm"
            />
          ) : (
            <p className="mt-2 text-xs text-faint">
              Anyone with a school address and this link can join, with no ceiling.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-line p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={expires}
              onChange={(e) => setExpires(e.target.checked)}
              className="accent-pink-500"
            />
            Expire it after a while
          </label>
          {expires ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                name="days"
                type="number"
                min={1}
                max={365}
                defaultValue={JOIN_LINK_TTL_DAYS}
                aria-label="Days before this link expires"
                className="hs-input py-1.5 text-sm"
              />
              <span className="shrink-0 text-xs text-muted">days</span>
            </div>
          ) : (
            <p className="mt-2 text-xs text-faint">
              The link stays live until somebody switches it off.
            </p>
          )}
        </div>
      </div>

      <Feedback state={state} />

      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Creating…">
        Create join link
      </SubmitButton>
    </form>
  );
}

/**
 * Prints the page.
 *
 * A separate button rather than telling people to use Ctrl+P, because the whole
 * point of the poster page is that somebody on a phone can send it to the staff
 * room printer without knowing a keyboard shortcut exists.
 */
export function PrintButton({ label = "Print this" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="hs-btn hs-btn-secondary hs-no-print"
    >
      {label}
    </button>
  );
}
