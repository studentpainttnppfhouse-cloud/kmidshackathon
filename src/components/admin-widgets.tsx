"use client";

import { useActionState, useState, useTransition } from "react";
import { createInvite, setUserDepartment, setUserFlag, setUserTier } from "@/lib/actions/admin";
import type { FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { ALLOWED_EMAIL_DOMAIN, TIER_BLURB, TIER_LABEL } from "@/lib/constants";
import type { Tier } from "@prisma/client";

const initial: FormState = {};
const TIERS = ["T0_ADVISOR", "T1_MEMBER", "T2_HEAD", "T3_ADMIN", "T4_OWNER"] as const;

export function InviteForm({
  departments,
  canCreateOwner,
}: {
  departments: { id: string; name: string }[];
  canCreateOwner: boolean;
}) {
  const [state, action] = useActionState(createInvite, initial);
  const [tier, setTier] = useState<Tier>("T1_MEMBER");

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="inv-email">
            KMIDS email
          </label>
          <input
            id="inv-email"
            name="email"
            type="email"
            required
            className="hs-input"
            placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="inv-name">
            Name
          </label>
          <input id="inv-name" name="name" className="hs-input" placeholder="Napat Sirichai" />
        </div>
        <div>
          <label className="hs-label" htmlFor="inv-tier">
            Tier
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
        <div>
          <label className="hs-label" htmlFor="inv-dept">
            Department
          </label>
          <select id="inv-dept" name="departmentId" className="hs-input">
            <option value="">None yet</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="hs-label" htmlFor="inv-role">
          Role title
        </label>
        <input id="inv-role" name="roleTitle" className="hs-input" placeholder="Graphic Designer" />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.ok}
        </p>
      ) : null}

      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Creating…">
        Create invite
      </SubmitButton>
    </form>
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
