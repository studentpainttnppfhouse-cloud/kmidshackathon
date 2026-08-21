"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/actions/auth";
import type { FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

const initial: FormState = {};

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="hs-label" htmlFor="current">
          Current password
        </label>
        <input
          id="current"
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className="hs-input"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            name="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="hs-input"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor="confirm-password">
            Confirm
          </label>
          <input
            id="confirm-password"
            name="confirm"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="hs-input"
          />
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

      <SubmitButton className="hs-btn hs-btn-secondary" pendingLabel="Saving…">
        Change password
      </SubmitButton>
    </form>
  );
}
