"use client";

import { useActionState } from "react";
import { acceptInvite, type FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
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

      <div>
        <span className="hs-label">Your email</span>
        <p className="rounded-[10px] bg-pink-50 px-3 py-2.5 text-sm font-medium text-pink-700">
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
          defaultValue={suggestedName}
          autoComplete="name"
          placeholder="Napat Sirichai"
          className="hs-input"
        />
      </div>

      <div>
        <label className="hs-label" htmlFor="password">
          Choose a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className="hs-input"
        />
        <p className="mt-1.5 text-xs text-faint">
          At least {MIN_PASSWORD_LENGTH} characters. You will type this once —
          after that the portal remembers you.
        </p>
      </div>

      <div>
        <label className="hs-label" htmlFor="confirm">
          Confirm password
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

      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
    </form>
  );
}
