"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/actions/auth";
import type { FormState } from "@/lib/actions/auth";
import { Feedback, PasswordField, SubmitButton } from "@/components/form-bits";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { PasskeyManager } from "@/components/passkey-manager";

const initial: FormState = {};

export function PasswordForm({ username }: { username?: string } = {}) {
  const [state, action] = useActionState(changePassword, initial);

  return (
    <div className="space-y-6">
    <form action={action} className="space-y-4">
      {username ? (
        <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      ) : null}
      <PasswordField
        id="current"
        name="current"
        label="Current password"
        autoComplete="current-password"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField
          id="new-password"
          name="password"
          label="New password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. A phrase you will remember beats a short one you will not.`}
        />
        <PasswordField
          id="confirm-password"
          name="confirm"
          label="Confirm"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
        />
      </div>

      <Feedback state={state} />

      <SubmitButton className="hs-btn hs-btn-secondary" pendingLabel="Saving…">
        Change password
      </SubmitButton>
    </form>
      <div className="border-t border-line-soft pt-5">
        <PasskeyManager />
      </div>
    </div>
  );
}
