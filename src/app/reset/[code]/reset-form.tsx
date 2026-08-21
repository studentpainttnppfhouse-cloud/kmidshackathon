"use client";

import { useActionState } from "react";
import { usePasswordReset, type FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

const initial: FormState = {};

export function ResetForm({ code }: { code: string }) {
  const [state, action] = useActionState(usePasswordReset, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="code" value={code} />

      <div>
        <label className="hs-label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className="hs-input"
        />
      </div>

      <div>
        <label className="hs-label" htmlFor="confirm">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className="hs-input"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>

      <p className="text-center text-xs text-faint">
        This signs out every other device on your account.
      </p>
    </form>
  );
}
