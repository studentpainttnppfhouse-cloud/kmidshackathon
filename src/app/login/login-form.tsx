"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "@/lib/actions/auth";
import { BotFields, Feedback, PasswordField, SubmitButton } from "@/components/form-bits";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";

const initial: FormState = {};

export function LoginForm() {
  const [state, action] = useActionState(signIn, initial);

  return (
    <form action={action} className="space-y-4">
      <BotFields />

      <div>
        <label className="hs-label" htmlFor="email">
          KMIDS email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          spellCheck={false}
          placeholder={`yourname@${ALLOWED_EMAIL_DOMAIN}`}
          className="hs-input"
        />
      </div>

      <PasswordField
        id="password"
        name="password"
        label="Password"
        autoComplete="current-password"
        placeholder="••••••••••"
      />

      <Feedback state={state} />

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>

      <p className="pt-1 text-center text-xs leading-relaxed text-faint">
        You stay signed in on this device for six months — through updates and
        redeploys. Only sign out if you are on a shared computer.
      </p>
    </form>
  );
}
