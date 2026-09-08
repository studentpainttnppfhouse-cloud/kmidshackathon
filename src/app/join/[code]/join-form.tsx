"use client";

import { useActionState } from "react";
import { useJoinLink } from "@/lib/actions/join-links";
import type { FormState } from "@/lib/actions/auth";
import { BotFields, Feedback, PasswordField, SubmitButton } from "@/components/form-bits";
import { ALLOWED_EMAIL_DOMAIN, MIN_PASSWORD_LENGTH } from "@/lib/constants";

const initial: FormState = {};

/**
 * Registering from a join link.
 *
 * The email field is typed rather than pre-filled, which is the one real
 * difference from accepting a personal invite: a join link names nobody, so the
 * address is the person's own claim and the server checks it against the school
 * domain. Everything else — the password rules, the bot fields, the wording —
 * is the invite form, because a new member should not be able to tell which of
 * the two doors they came through.
 */
export function JoinForm({ code }: { code: string }) {
  const [state, action] = useActionState(useJoinLink, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="code" value={code} />
      <BotFields />

      <div>
        <label className="hs-label" htmlFor="join-name">
          Full name
        </label>
        <input
          id="join-name"
          name="name"
          required
          maxLength={120}
          autoComplete="name"
          placeholder="Napat Sirichai"
          className="hs-input"
        />
      </div>

      <div>
        <label className="hs-label" htmlFor="join-email">
          KMIDS email
        </label>
        <input
          id="join-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
          className="hs-input"
        />
        <p className="mt-1.5 text-xs text-faint">
          Your school address. Nothing else can register here.
        </p>
      </div>

      <PasswordField
        id="join-password"
        name="password"
        label="Choose a password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. You will type this once — after that the portal remembers you.`}
      />

      <PasswordField
        id="join-confirm"
        name="confirm"
        label="Confirm password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />

      <Feedback state={state} />

      <SubmitButton pendingLabel="Creating your account…">Join the team</SubmitButton>
    </form>
  );
}
