"use client";

import { useCallback, useEffect, useState } from "react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";

type Passkey = { id: string; label: string; createdAt: string; lastUsedAt: string | null; backedUp: boolean };

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The signed-in person's passkeys: list, add, remove. Self-contained (talks to
 * /api/passkeys), so it can drop into any settings card.
 */
export function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [supported, setSupported] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/passkeys", { cache: "no-store" });
    if (res.ok) setPasskeys(((await res.json()) as { passkeys: Passkey[] }).passkeys);
  }, []);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    void load();
  }, [load]);

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      const options = await (await fetch("/api/passkeys/register", { cache: "no-store" })).json();
      const attestation = await startRegistration({ optionsJSON: options });
      const res = await fetch("/api/passkeys/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(attestation),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? "That passkey could not be saved.");
      setMessage({ tone: "ok", text: "Passkey added. Next time, pick it on the sign-in page." });
      await load();
    } catch (error) {
      const text =
        error instanceof Error && error.name === "NotAllowedError"
          ? "Cancelled."
          : error instanceof Error && error.name === "InvalidStateError"
            ? "This device already has a passkey for your account."
            : error instanceof Error
              ? error.message
              : "That passkey could not be saved.";
      setMessage({ tone: "error", text });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this passkey? You can still sign in with your password.")) return;
    setBusy(true);
    const res = await fetch(`/api/passkeys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    setMessage(res.ok ? { tone: "ok", text: "Passkey removed." } : { tone: "error", text: "Could not remove it." });
    await load();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="hs-label mb-0">Passkeys</span>
        <button
          type="button"
          onClick={add}
          disabled={busy || !supported}
          className="hs-btn hs-btn-secondary px-3 py-1.5 text-xs"
        >
          {busy ? "Working…" : "＋ Add a passkey"}
        </button>
      </div>

      {!supported ? (
        <p className="text-xs text-faint">This browser does not support passkeys.</p>
      ) : null}

      {passkeys === null ? (
        <p className="text-xs text-faint">Loading…</p>
      ) : passkeys.length === 0 ? (
        <p className="text-xs text-faint">No passkeys yet. Sign in with Face ID, Touch ID, Windows Hello or a phone.</p>
      ) : (
        <ul className="space-y-2">
          {passkeys.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{p.label}</span>
                <span className="block text-xs text-faint">
                  Added {when(p.createdAt)} · last used {when(p.lastUsedAt)}
                  {p.backedUp ? " · synced" : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={busy}
                className="hs-btn hs-btn-ghost px-3 py-1.5 text-xs"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`hs-feedback ${message.tone === "error" ? "hs-feedback-error" : "hs-feedback-ok"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
