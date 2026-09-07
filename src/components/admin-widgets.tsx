"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createInvite,
  setUserDepartment,
  setUserFlag,
  setUserRole,
  setUserTier,
  type InviteState,
} from "@/lib/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import {
  ALLOWED_EMAIL_DOMAIN,
  ROLE_OPTIONS,
  TEAMS,
  TIER_BLURB,
  TIER_LABEL,
  tierForRole,
} from "@/lib/constants";
import type { Tier } from "@prisma/client";

const initial: InviteState = {};
const TIERS = ["T0_ADVISOR", "T1_MEMBER", "T2_HEAD", "T3_ADMIN", "T4_OWNER"] as const;

export type AdminDept = { id: string; name: string; slug: string };

/**
 * Adding somebody to the portal: a name and an email, and that is it.
 *
 * Roles and teams get decided over weeks; accounts should not wait on them. So
 * the required half of this form is two fields, the team and role live behind a
 * disclosure for when they are already known, and everything set here can be
 * changed later from the user list below.
 *
 * The invite link appears in the form the moment the invite exists. There is no
 * email service in this deployment — copying the link and sending it is the
 * delivery mechanism, so it should not be a hunt through a list.
 */
export function InviteForm({
  departments,
  canCreateOwner,
}: {
  departments: AdminDept[];
  canCreateOwner: boolean;
}) {
  const [state, action] = useActionState(createInvite, initial);
  const [deptId, setDeptId] = useState("");
  const [role, setRole] = useState("");
  const [tier, setTier] = useState<Tier>("T1_MEMBER");

  const slug = departments.find((d) => d.id === deptId)?.slug ?? "";
  const roles = ROLE_OPTIONS.filter((option) => option.slug === slug);

  // Picking a role moves the tier with it. Still a select, not a readout: the
  // chart is the plan and the admin is allowed to disagree with it.
  const chooseRole = (title: string) => {
    setRole(title);
    const implied = tierForRole(title);
    if (implied) setTier(implied);
  };

  if (state.ok && state.code) {
    return (
      <div className="space-y-3">
        <p role="status" className="hs-feedback hs-feedback-ok">
          {state.ok}
        </p>
        <div className="rounded-xl border border-ok-edge bg-ok-soft p-3">
          <p className="hs-eyebrow mb-1.5">Invite link for {state.email}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2.5 py-2 text-xs text-muted">
              /invite/{state.code}
            </code>
            <CopyLink path={`/invite/${state.code}`} label="Copy invite link" />
          </div>
          <p className="mt-2 text-xs text-muted">
            Good for {INVITE_DAYS} days. They pick their own password when they open it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="hs-btn hs-btn-secondary"
        >
          Add somebody else
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="inv-name">
            Name
          </label>
          <input
            id="inv-name"
            name="name"
            required
            autoComplete="off"
            className="hs-input"
            placeholder="Theerapat Arjaree"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="inv-email">
            KMIDS email
          </label>
          <input
            id="inv-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            className="hs-input"
            placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
          />
        </div>
      </div>

      <details className="hs-disclosure">
        <summary>
          Set their team and role now
          <span className="hs-disclosure-note">optional — you can do this later</span>
        </summary>

        <div className="grid gap-4 pt-3 sm:grid-cols-2">
          <div>
            <label className="hs-label" htmlFor="inv-dept">
              Team
            </label>
            <select
              id="inv-dept"
              name="departmentId"
              value={deptId}
              onChange={(e) => {
                setDeptId(e.target.value);
                setRole("");
              }}
              className="hs-input"
            >
              <option value="">Not yet</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="hs-label" htmlFor="inv-role">
              Role
            </label>
            <select
              id="inv-role"
              name="roleTitle"
              value={role}
              onChange={(e) => chooseRole(e.target.value)}
              disabled={roles.length === 0}
              className="hs-input"
            >
              <option value="">{deptId ? "Not yet" : "Pick a team first"}</option>
              {roles.map((option) => (
                <option key={option.title} value={option.title}>
                  {option.title}
                  {option.lead ? " · leads the team" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="hs-label" htmlFor="inv-tier">
              Permission tier
            </label>
            <select
              id="inv-tier"
              name="tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier)}
              className="hs-input"
            >
              {TIERS.map((t) => (
                <option key={t} value={t} disabled={t === "T4_OWNER" && !canCreateOwner}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-faint">{TIER_BLURB[tier]}</p>
          </div>
        </div>
      </details>

      {state.error ? (
        <p role="alert" className="hs-feedback hs-feedback-error">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Creating…">
        Create invite
      </SubmitButton>
    </form>
  );
}

/** Matches INVITE_TTL_DAYS. Stated here so the client bundle needs no import. */
const INVITE_DAYS = 14;

/**
 * Sets a role from the chart, and with it the tier that role implies.
 *
 * Grouped by team so the list reads like the chart itself rather than sixteen
 * titles in a row.
 */
export function RoleSelect({
  userId,
  current,
}: {
  userId: string;
  current: string | null;
}) {
  const [pending, startTransition] = useTransition();

  // A title typed in by hand — from the CSV import, or an older account — is
  // kept as an option of its own so opening this select cannot silently drop it.
  const known = ROLE_OPTIONS.some((option) => option.title === current);

  return (
    <select
      value={current ?? ""}
      disabled={pending}
      aria-label="Role on the staff chart"
      onChange={(e) => startTransition(() => setUserRole(userId, e.target.value))}
      className="hs-input max-w-[210px] py-1.5 text-xs"
    >
      <option value="">No role yet</option>
      {current && !known ? <option value={current}>{current}</option> : null}
      {TEAMS.filter((team) => team.roles.length > 0).map((team) => (
        <optgroup key={team.slug} label={team.name}>
          {team.roles.map((role) => (
            <option key={`${team.slug}:${role.title}`} value={role.title}>
              {role.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** A link the admin copies and hands over — there is no email service. */
export function CopyLink({ path, label = "Copy link" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${window.location.origin}${path}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // Clipboard is blocked outside a secure context; show the URL so the
          // admin can still select it by hand.
          window.prompt("Copy this link:", url);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="hs-btn hs-btn-secondary px-3 py-1.5 text-xs"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function TierSelect({
  userId,
  current,
  disabled,
  canSetOwner,
}: {
  userId: string;
  current: Tier;
  disabled?: boolean;
  canSetOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={disabled || pending}
      aria-label="Permission tier"
      onChange={(e) =>
        startTransition(() => setUserTier(userId, e.target.value as Tier))
      }
      className="hs-input max-w-[150px] py-1.5 text-xs"
    >
      {TIERS.map((t) => (
        <option key={t} value={t} disabled={t === "T4_OWNER" && !canSetOwner}>
          {TIER_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

export function DepartmentSelect({
  userId,
  current,
  departments,
}: {
  userId: string;
  current: string | null;
  departments: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={current ?? ""}
      disabled={pending}
      aria-label="Department"
      onChange={(e) => startTransition(() => setUserDepartment(userId, e.target.value))}
      className="hs-input max-w-[190px] py-1.5 text-xs"
    >
      <option value="">No department</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

export function FlagToggle({
  userId,
  flag,
  value,
  label,
}: {
  userId: string;
  flag: "isReserve" | "isMentor" | "isAlumni" | "isActive";
  value: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(e) => startTransition(() => setUserFlag(userId, flag, e.target.checked))}
        className="accent-pink-500"
      />
      {label}
    </label>
  );
}
