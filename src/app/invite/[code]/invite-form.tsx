"use client";

import { useActionState } from "react";
import { acceptInvite, type FormState } from "@/lib/actions/auth";
import { BotFields, Feedback, PasswordField, SubmitButton } from "@/components/form-bits";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

const initial: FormState = {};

export function InviteForm({
  code,
  email,
  suggestedName,
}: {
  code: string;
  email: string;
  suggestedName: string;
}) {
  const [state, action] = useActionState(acceptInvite, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="code" value={code} />
      <BotFields />

      <div>
        <span className="hs-label">Your email</span>
        <p className="rounded-[10px] bg-tint px-3 py-2.5 text-sm font-medium text-brand-deep">
          {email}
        </p>
      </div>

      <div>
        <label className="hs-label" htmlFor="name">
          Full name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          defaultValue={suggestedName}
          autoComplete="name"
          placeholder="Napat Sirichai"
          className="hs-input"
        />
      </div>

      <PasswordField
        id="password"
        name="password"
        label="Choose a password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. You will type this once — after that the portal remembers you.`}
      />

      <PasswordField
        id="confirm"
        name="confirm"
        label="Confirm password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />

      <Feedback state={state} />

      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
    </form>
  );
}
