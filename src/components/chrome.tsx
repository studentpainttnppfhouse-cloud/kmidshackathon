"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The furniture that sits around every page: theme, scroll affordances, the
 * cookie notice, the contact button.
 *
 * All of it is progressive. Every piece works without JavaScript having run
 * (the page is server-rendered and readable), degrades to nothing if it fails,
 * and respects `prefers-reduced-motion` where it moves.
 */

// ---------------------------------------------------------------------------
// Dark mode
// ---------------------------------------------------------------------------

type Theme = "light" | "dark" | "system";
const THEME_KEY = "hs-theme";

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: Theme = "system";
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      // Private mode, or storage disabled. System preference it is.
    }
    setTheme(stored);
    applyTheme(stored);
    setReady(true);

    // Following the OS while set to "system" means a phone switching at sunset
    // switches the portal too, without a reload.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (stored === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  };

  const options: { value: Theme; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "☀" },
    { value: "dark", label: "Dark", icon: "☾" },
    { value: "system", label: "System", icon: "◐" },
  ];

  return (
    <div
      className="hs-theme-toggle hs-no-print"
      role="radiogroup"
      aria-label="Colour theme"
      // Rendered but inert until the stored choice is known, so the control
      // never flashes the wrong selection on first paint.
      data-ready={ready ? "1" : "0"}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          aria-label={`${option.label} theme`}
          title={`${option.label} theme`}
          onClick={() => choose(option.value)}
          className={`hs-theme-option ${theme === option.value ? "is-active" : ""}`}
        >
          <span aria-hidden="true">{option.icon}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Sets the theme before first paint.
 *
 * Rendered into the document head as a blocking script, which is the one place
 * an inline script is the right answer: anything asynchronous paints the light
 * theme first and then corrects itself, and that flash is worse on a phone in a
 * dark room than any amount of purity about inline scripts. It carries the CSP
 * nonce, so the policy stays strict.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  const code = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}

// ---------------------------------------------------------------------------
// Scroll progress + back to top
// ---------------------------------------------------------------------------

export function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable <= 0 ? 0 : Math.min(1, window.scrollY / scrollable));
    };

    // rAF-coalesced: scroll fires far more often than the screen refreshes, and
    // a setState per event is how a long list starts to feel sticky on a phone.
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="hs-scroll-progress hs-no-print" aria-hidden="true">
      <span style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    // Focus follows the scroll, or a keyboard user is left where they were.
    document.getElementById("hs-main")?.focus({ preventScroll: true });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      className={`hs-back-to-top hs-no-print ${visible ? "is-visible" : ""}`}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <span aria-hidden="true">↑</span>
      <span className="sr-only">Back to top</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cookie notice
// ---------------------------------------------------------------------------

const COOKIE_NOTICE_KEY = "hs-cookie-notice";

/**
 * A notice, not a consent gate.
 *
 * The portal sets exactly one cookie, it is the session, and it is strictly
 * necessary — there is no analytics, no advertising and no third-party tag, so
 * under PDPA and the GDPR alike there is nothing here that requires opt-in.
 * Offering an "accept / reject" choice would be theatre: rejecting would have
 * to log the person out. So this says what is stored and why, once, and gets
 * out of the way.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(COOKIE_NOTICE_KEY) !== "seen") setVisible(true);
    } catch {
      // Storage unavailable: showing it every time is better than never.
      setVisible(true);
    }
  }, []);

  // A fixed bar across the bottom of the viewport sits *on top* of whatever is
  // at the bottom of the page — which on a form is the submit button. The
  // notice therefore reserves its own space instead of borrowing it, and gives
  // it back the moment it is dismissed.
  useEffect(() => {
    document.body.dataset.cookieNotice = visible ? "1" : "0";
    return () => {
      delete document.body.dataset.cookieNotice;
    };
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, "seen");
    } catch {
      /* nothing to do */
    }
  };

  if (!visible) return null;

  return (
    <div className="hs-cookie hs-no-print" role="region" aria-label="Cookie notice">
      <p>
        This portal keeps <strong>one</strong> cookie — the sign-in that keeps you logged in on
        this device. No analytics, no tracking, nothing shared with anyone else.
      </p>
      <button type="button" onClick={dismiss} className="hs-btn hs-btn-primary px-4 py-1.5 text-sm">
        Got it
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy to clipboard
// ---------------------------------------------------------------------------

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  className = "hs-btn hs-btn-secondary px-3 py-1.5 text-xs",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Safari without permission, or an insecure context. The fallback is the
      // oldest trick there is, and it still works everywhere.
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try {
        document.execCommand("copy");
      } catch {
        return;
      } finally {
        document.body.removeChild(field);
      }
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {copied ? `✓ ${copiedLabel}` : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

/**
 * A real modal for anything destructive.
 *
 * `window.confirm` blocks the whole tab, cannot be styled, and on iOS Safari
 * reads out the origin in a way that makes a school portal look like a phishing
 * page. This is a focus-trapped dialog that submits the surrounding form only
 * when the person says so.
 */
export function ConfirmButton({
  children,
  title,
  body,
  confirmLabel = "Yes, do it",
  className = "hs-btn hs-btn-danger px-3 py-1.5 text-xs",
  onConfirm,
}: {
  children: React.ReactNode;
  title: string;
  body?: string;
  confirmLabel?: string;
  className?: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("[data-autofocus]")?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      // Focus trap: Tab must not walk out of the dialog into the page behind it.
      const focusable = dialog.current?.querySelectorAll<HTMLElement>("button, [href], input");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open]);

  return (
    <>
      <button ref={opener} type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>

      {open ? (
        <div className="hs-modal-backdrop hs-no-print" onClick={() => setOpen(false)}>
          <div
            ref={dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="hs-confirm-title"
            className="hs-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="hs-confirm-title" className="hs-h2">
              {title}
            </h2>
            {body ? <p className="mt-2 text-sm text-muted">{body}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                data-autofocus
                className="hs-btn hs-btn-ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hs-btn hs-btn-danger"
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export function Faq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="hs-faq">
      {items.map((item) => (
        // <details> is the accessible expander the platform already ships:
        // keyboard-operable, screen-reader-announced, and it still opens when
        // JavaScript has not loaded.
        <details key={item.q} className="hs-faq-item">
          <summary>
            <span>{item.q}</span>
            <span className="hs-faq-chevron" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="hs-faq-body">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating contact
// ---------------------------------------------------------------------------

export function ContactButton({ lineUrl }: { lineUrl?: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="hs-contact hs-no-print">
      {open ? (
        <div className="hs-contact-card" role="dialog" aria-label="Get help">
          <p className="text-sm font-bold text-ink">Stuck on something?</p>
          <p className="mt-1 text-xs text-muted">
            Ask your department head first — they can reassign, approve and unlock. Anything the
            portal itself gets wrong goes to an admin.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            <a href="/people" className="hs-btn hs-btn-secondary text-sm">
              Find your head
            </a>
            <a href="/help" className="hs-btn hs-btn-ghost text-sm">
              Portal help & FAQ
            </a>
            {lineUrl ? (
              <a
                href={lineUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="hs-btn hs-btn-ghost text-sm"
              >
                Staff LINE group ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="hs-contact-fab"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? "✕" : "?"}</span>
        <span className="sr-only">{open ? "Close help" : "Get help"}</span>
      </button>
    </div>
  );
}
