"use client";

import { useActionState } from "react";
import { requestRecovery } from "@/lib/actions/people";
import type { FormState } from "@/lib/actions/auth";
import { BotFields, Feedback, SubmitButton } from "@/components/form-bits";

const initial: FormState = {};

export function ForgotForm() {
  const [state, action] = useActionState(requestRecovery, initial);

  if (state.ok) return <Feedback state={state} />;

  return (
    <form action={action} className="space-y-4">
      <BotFields />

      <div>
        <label className="hs-label" htmlFor="kind">
          What did you forget?
        </label>
        <select id="kind" name="kind" defaultValue="PASSWORD" className="hs-input">
          <option value="PASSWORD">My password</option>
          <option value="USERNAME">My username</option>
          <option value="EMAIL">Which email I use</option>
          <option value="OTHER">Something else</option>
        </select>
      </div>

      <div>
        <label className="hs-label" htmlFor="contact">
          Your email, or your full name
        </label>
        <input
          id="contact"
          name="contact"
          required
          maxLength={190}
          autoComplete="email"
          spellCheck={false}
          className="hs-input"
        />
      </div>

      <div>
        <label className="hs-label" htmlFor="name">
          Full name <span className="text-faint">(optional)</span>
        </label>
        <input id="name" name="name" maxLength={120} autoComplete="name" className="hs-input" />
      </div>

      <div>
        <label className="hs-label" htmlFor="message">
          Message for the admin
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          maxLength={1000}
          placeholder="Which department you are in, how to reach you…"
          className="hs-input"
        />
      </div>

      <Feedback state={state} />

      <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
    </form>
  );
}
