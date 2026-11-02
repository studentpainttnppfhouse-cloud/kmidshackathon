"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  WebAuthnAbortService,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
} from "@simplewebauthn/browser";
import { signIn, type FormState } from "@/lib/actions/auth";
import { BotFields, Feedback, PasswordField, SubmitButton } from "@/components/form-bits";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";

const initial: FormState = {};

async function passkeySignIn(autofill: boolean): Promise<string | null> {
  const options = await (await fetch("/api/passkeys/login", { cache: "no-store" })).json();
  const assertion = await startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill });
  const res = await fetch("/api/passkeys/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(assertion),
  });
  const body = (await res.json()) as { ok?: boolean; redirect?: string; error?: string };
  if (!res.ok || !body.ok) throw new Error(body.error ?? "That passkey did not work.");
  return body.redirect ?? "/dashboard";
}

export function LoginForm() {
  const [state, action] = useActionState(signIn, initial);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  // Conditional UI: the browser offers saved passkeys right in the username
  // field's autofill list, next to saved passwords.
  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    if (started.current) return;
    started.current = true;
    void browserSupportsWebAuthnAutofill().then(async (ok) => {
      if (!ok) return;
      try {
        const to = await passkeySignIn(true);
        if (to) window.location.assign(to);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError" && error.name !== "NotAllowedError") {
          setPasskeyError(error.message);
        }
      }
    });
    return () => WebAuthnAbortService.cancelCeremony();
  }, []);

  async function onPasskey() {
    setBusy(true);
    setPasskeyError(null);
    try {
      const to = await passkeySignIn(false);
      if (to) window.location.assign(to);
    } catch (error) {
      setPasskeyError(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Cancelled, or no passkey for this site on this device."
          : error instanceof Error
            ? error.message
            : "That passkey did not work.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form action={action} method="post" className="space-y-4">
        <BotFields />

        <div>
          <label className="hs-label" htmlFor="email">
            Email or username
          </label>
          <input
            id="email"
            name="email"
            type="text"
            inputMode="email"
            required
            autoComplete="username webauthn"
            autoCapitalize="none"
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
      </form>

      {supported ? (
        <button
          type="button"
          onClick={onPasskey}
          disabled={busy}
          className="hs-btn hs-btn-secondary w-full"
        >
          {busy ? "Waiting for your passkey…" : "Sign in with a passkey"}
        </button>
      ) : null}

      {passkeyError ? <Feedback state={{ error: passkeyError }} /> : null}

      <p className="text-center text-xs">
        <Link href="/forgot" className="font-semibold text-brand-deep">
          Forgot your username, password or email?
        </Link>
      </p>
    </div>
  );
}
