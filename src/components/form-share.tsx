"use client";

import { useState, type ReactNode } from "react";

/**
 * The "Share link" button on a form's toolbar: the link, a copy button and a
 * QR code (rendered on the server and passed in as `qr`).
 */
export function FormShare({ url, isPublic, qr }: { url: string; isPublic: boolean; qr: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.getElementById("form-share-url") as HTMLInputElement | null;
      input?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hs-btn hs-btn-primary px-3 py-1.5 text-xs"
      >
        Share link
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Share this form"
          className="hs-card absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-3 p-4"
        >
          <p className="text-xs text-faint">
            {isPublic ? "Anyone with the link can answer." : "Staff only: people must sign in to answer."}
          </p>
          <div className="flex gap-2">
            <input
              id="form-share-url"
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="hs-input min-w-0 flex-1 text-xs"
            />
            <button type="button" onClick={copy} className="hs-btn hs-btn-secondary px-3 py-1.5 text-xs">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex justify-center">{qr}</div>
        </div>
      ) : null}
    </div>
  );
}
