"use client";

import { useActionState } from "react";
import { usePasswordReset, type FormState } from "@/lib/actions/auth";
import { BotFields, Feedback, PasswordField, SubmitButton } from "@/components/form-bits";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

const initial: FormState = {};

export function ResetForm({ code, email }: { code: string; email: string }) {
  const [state, action] = useActionState(usePasswordReset, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="code" value={code} />
      <BotFields />
      {/* Lets the password manager file the new password under the right account. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        className="hs-input"
        aria-label="Account"
      />

      <PasswordField
        id="password"
        name="password"
        label="New password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. Using this link signs out every other device on your account.`}
      />

      <PasswordField
        id="confirm"
        name="confirm"
        label="Confirm new password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />

      <Feedback state={state} />

      <SubmitButton pendingLabel="Setting your password…">Set new password</SubmitButton>
    </form>
  );
}
