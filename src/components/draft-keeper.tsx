"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps what you typed, so a closed tab is not a lost afternoon.
 *
 * Drop it inside any form and every text field in that form is written to this
 * browser as you type, then put back if you come back to an empty one. It is
 * one component rather than a hook wired into each editor because the failure
 * it prevents is the same everywhere: somebody writes four paragraphs of a
 * sponsor proposal on a phone, the browser reclaims the tab, and the work is
 * gone.
 *
 * What it deliberately is *not*:
 *
 *   - a sync. Drafts stay in the browser that typed them. Writing every
 *     keystroke to TiDB would be a write per person per second for text nobody
 *     has decided to save yet, and a half-finished announcement is not
 *     something the rest of the team should be able to read.
 *   - a place for anything sensitive. Passwords, file inputs, hidden fields and
 *     the anti-bot fields are all skipped by name and by type, so a draft can
 *     never end up holding a credential.
 *
 * Files are the exception, and they go the other way: an attachment is written
 * to the database the moment it is chosen (see components/attachments.tsx),
 * because bytes are the one thing a browser cannot hold on to safely.
 */

/** Fields whose values must never be written to disk. */
const SKIP_TYPES = new Set(["password", "file", "hidden", "submit", "button", "checkbox", "radio"]);
const SKIP_NAMES = new Set(["company_website", "form_rendered_at", "code", "id"]);

/** A draft is text, not an upload. 100 KB is a long document and a hard stop. */
const MAX_DRAFT_BYTES = 100_000;

/** Old drafts expire so a form does not restore something from last term. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type Stored = { at: number; fields: Record<string, string> };

function storageKey(key: string): string {
  return `hs-draft:${key}`;
}

function readDraft(key: string): Stored | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Stored).at !== "number" ||
      typeof (parsed as Stored).fields !== "object"
    ) {
      return null;
    }

    const stored = parsed as Stored;
    if (Date.now() - stored.at > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(key));
      return null;
    }

    return stored;
  } catch {
    // Private mode, a full quota, or a value some other version of this code
    // wrote. None of them is a reason to fail to render a form.
    return null;
  }
}

export function DraftKeeper({ formKey }: { formKey: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    const fields = (): HTMLElement[] =>
      [...form.querySelectorAll<HTMLElement>("input, textarea, select")].filter((field) => {
        const name = field.getAttribute("name");
        if (!name || SKIP_NAMES.has(name)) return false;
        if (field instanceof HTMLInputElement && SKIP_TYPES.has(field.type)) return false;
        return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement;
      });

    // --- Put a draft back ---------------------------------------------------
    const draft = readDraft(formKey);
    if (draft) {
      let filled = false;

      for (const field of fields()) {
        const name = field.getAttribute("name") as string;
        const value = draft.fields[name];
        const input = field as HTMLInputElement | HTMLTextAreaElement;

        // Only ever into an empty box. A form that already carries a saved
        // document must not have last week's draft typed over the top of it.
        if (typeof value === "string" && value.length > 0 && input.value.length === 0) {
          input.value = value;
          // React controls some of these. Dispatching the event it listens for
          // is what makes the restored text real to the component's own state
          // rather than a value the next render throws away.
          input.dispatchEvent(new Event("input", { bubbles: true }));
          filled = true;
        }
      }

      if (filled) setRestored(true);
    }

    // --- Keep saving --------------------------------------------------------
    let timer: ReturnType<typeof setTimeout> | null = null;

    const save = () => {
      const collected: Record<string, string> = {};
      let size = 0;

      for (const field of fields()) {
        const name = field.getAttribute("name") as string;
        const value = (field as HTMLInputElement | HTMLTextAreaElement).value;
        if (value.length === 0) continue;

        size += name.length + value.length;
        if (size > MAX_DRAFT_BYTES) return; // too big to be a draft; leave the last good one
        collected[name] = value;
      }

      try {
        if (Object.keys(collected).length === 0) {
          localStorage.removeItem(storageKey(formKey));
          setSavedAt(null);
          return;
        }

        localStorage.setItem(
          storageKey(formKey),
          JSON.stringify({ at: Date.now(), fields: collected } satisfies Stored),
        );
        setSavedAt(Date.now());
      } catch {
        // A full or blocked localStorage means no draft. The form still works.
      }
    };

    const onInput = () => {
      if (timer) clearTimeout(timer);
      // Long enough that typing a sentence is one write, short enough that
      // closing the tab mid-thought still catches it.
      timer = setTimeout(save, 700);
    };

    const onSubmit = () => {
      if (timer) clearTimeout(timer);
      try {
        localStorage.removeItem(storageKey(formKey));
      } catch {
        // Nothing to clean up if nothing could be written.
      }
      setSavedAt(null);
      setRestored(false);
    };

    form.addEventListener("input", onInput);
    form.addEventListener("submit", onSubmit);

    return () => {
      if (timer) clearTimeout(timer);
      form.removeEventListener("input", onInput);
      form.removeEventListener("submit", onSubmit);
    };
  }, [formKey]);

  return (
    <span ref={anchor} className="block text-xs text-faint" aria-live="polite">
      {restored ? (
        <span className="text-warn-strong">
          <span aria-hidden="true">↩</span> Put back from a draft on this device.{" "}
        </span>
      ) : null}
      {savedAt ? (
        <span>
          <span aria-hidden="true">✓</span> Draft kept on this device.
        </span>
      ) : null}
    </span>
  );
}
