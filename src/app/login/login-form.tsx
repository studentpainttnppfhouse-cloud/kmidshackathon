"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";

const initial: FormState = {};

export function LoginForm() {
  const [state, action] = useActionState(signIn, initial);

  return (
    <form action={action} className="space-y-4">
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

      <div>
        <label className="hs-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••••"
          className="hs-input"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>

      <p className="pt-1 text-center text-xs leading-relaxed text-faint">
        You stay signed in on this device for six months — through updates and
        redeploys. Only sign out if you are on a shared computer.
      </p>
    </form>
  );
}
