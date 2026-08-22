"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/actions/auth";

/**
 * The parts every form in the portal shares: a password field you can read
 * back, the invisible bot checks, and one consistent success/error state.
 */

// ---------------------------------------------------------------------------
// Password with a visibility toggle
// ---------------------------------------------------------------------------

export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  minLength,
  required = true,
  hint,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);
  const hintId = useId();

  return (
    <div>
      <label className="hs-label" htmlFor={id}>
        {label}
      </label>
      <div className="hs-password">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          className="hs-input"
          // A password manager that has already filled the field must not have
          // its value re-typed by the browser when the type attribute flips.
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          className="hs-password-toggle"
          aria-pressed={shown}
          // The label says what the button *does*, not what the state is:
          // screen-reader users hear the action, sighted users see the icon.
          aria-label={shown ? "Hide password" : "Show password"}
          title={shown ? "Hide password" : "Show password"}
        >
          <span aria-hidden="true">{shown ? "🙈" : "👁"}</span>
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bot checks
// ---------------------------------------------------------------------------

/**
 * The two fields `looksAutomated()` reads on the server.
 *
 * The honeypot is hidden from people three ways over — off-screen, zero
 * opacity, `aria-hidden`, `tabIndex={-1}` — because "hidden" has to mean hidden
 * to a screen reader and a keyboard too, or the anti-bot measure becomes an
 * accessibility bug. `autoComplete="off"` keeps a password manager from
 * helpfully filling it in and locking a real person out.
 */
export function BotFields() {
  const [renderedAt, setRenderedAt] = useState("");

  // Stamped on the client after mount rather than rendered on the server: a
  // server timestamp would be the time the *page* was built, which for a cached
  // page is hours ago and would look like a replay.
  useEffect(() => setRenderedAt(String(Date.now())), []);

  return (
    <>
      <div className="hs-honeypot" aria-hidden="true">
        <label htmlFor="company_website">Company website (leave this empty)</label>
        <input
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input type="hidden" name="form_rendered_at" value={renderedAt} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Success / error states
// ---------------------------------------------------------------------------

/**
 * One success and one failure state for every form in the portal.
 *
 * `role="alert"` for errors so a screen reader interrupts and reads it; the
 * softer `role="status"` for success so it is announced without cutting off
 * whatever is being read. The error also takes focus, because on a phone the
 * message can easily be off-screen from the button that was just pressed.
 */
export function Feedback({ state }: { state: FormState }) {
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);

  if (state.error) {
    return (
      <p ref={errorRef} tabIndex={-1} role="alert" className="hs-feedback hs-feedback-error">
        <span aria-hidden="true">⚠</span> {state.error}
      </p>
    );
  }

  if (state.ok) {
    return (
      <p role="status" className="hs-feedback hs-feedback-ok">
        <span aria-hidden="true">✓</span> {state.ok}
      </p>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export function SubmitButton({
  children,
  pendingLabel,
  className = "hs-btn hs-btn-primary w-full",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="hs-spinner" aria-hidden="true" />
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// UTM capture
// ---------------------------------------------------------------------------

const UTM_KEY = "hs-utm";
const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/**
 * Remembers where somebody arrived from, and cleans the URL afterwards.
 *
 * The portal is invite-only, so the useful question is not "which ad worked"
 * but "which of the ways we hand out invite links do people actually follow" —
 * the LINE group, a QR code on a poster, a link in a slide deck. Tagging those
 * links with `?utm_source=` answers it.
 *
 * It stays in this browser. Nothing is sent anywhere, no third-party script is
 * loaded, and the parameters are stripped from the address bar once read, so a
 * screenshot of a signed-in portal does not leak a campaign tag. Values are
 * whitelisted by name and truncated: a UTM parameter is attacker-controlled
 * text that arrives in a URL, and it is never rendered as markup.
 */
export function UtmCapture() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const found: Record<string, string> = {};

      for (const key of UTM_PARAMS) {
        const value = url.searchParams.get(key);
        if (value) found[key] = value.slice(0, 80).replace(/[^\w .:/-]/g, "");
      }

      if (Object.keys(found).length === 0) return;

      const existing = sessionStorage.getItem(UTM_KEY);
      if (!existing) {
        // First touch wins: the link somebody actually followed in, not the
        // last page they happened to land on.
        sessionStorage.setItem(
          UTM_KEY,
          JSON.stringify({ ...found, at: new Date().toISOString() }),
        );
      }

      for (const key of UTM_PARAMS) url.searchParams.delete(key);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch {
      // A blocked sessionStorage must not stop the page rendering.
    }
  }, []);

  return null;
}
