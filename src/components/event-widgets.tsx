"use client";

import { useActionState, useTransition } from "react";
import { reportIncident, toggleCheckin } from "@/lib/actions/event";
import type { FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function CheckinButton({ day, checkedIn }: { day: string; checkedIn: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => toggleCheckin(day))}
      className={`hs-btn w-full text-base ${checkedIn ? "hs-btn-secondary" : "hs-btn-primary"}`}
      style={{ minHeight: 56 }}
    >
      {pending ? "…" : checkedIn ? "Check out" : "Check in"}
    </button>
  );
}

export function IncidentForm() {
  const [state, action] = useActionState(reportIncident, initial);

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="hs-label" htmlFor="inc-desc">
          What happened
        </label>
        <textarea
          id="inc-desc"
          name="description"
          rows={3}
          required
          className="hs-input resize-y"
          placeholder="Be factual. Who, what, where, when."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="inc-sev">
            Severity
          </label>
          <select id="inc-sev" name="severity" defaultValue="low" className="hs-input">
            <option value="low">Low — note it</option>
            <option value="medium">Medium — needs someone</option>
            <option value="high">High — needs someone now</option>
          </select>
        </div>
        <div>
          <label className="hs-label" htmlFor="inc-loc">
            Location
          </label>
          <input id="inc-loc" name="location" className="hs-input" placeholder="Hall B, table 14" />
        </div>
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

      <SubmitButton className="hs-btn hs-btn-danger w-full" pendingLabel="Sending…">
        Report an incident
      </SubmitButton>
    </form>
  );
}
