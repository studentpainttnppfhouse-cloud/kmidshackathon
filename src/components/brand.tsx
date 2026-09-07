import { Ecg } from "@/components/ui";

/**
 * The mark, on its brand tile.
 *
 * The heart is the same path public/icon.svg draws, so the logo in the sidebar
 * and the icon in the browser tab are the same shape. Both come from
 * scripts/generate-icons.mjs — change the curve there and copy it here, or the
 * two drift apart. The tile stays a flat brand fill rather than the icon's
 * gradient: the gradient's dark end has no contrast-checked token in dark mode,
 * and a white heart on light pink is not readable.
 */
export const MARK_PATH =
  "M32 48C20.5 39.5 12 32.5 12 25.5C12 19.5 16.8 15.5 22.4 15.5" +
  "C26.6 15.5 30.2 18 32 21.4C33.8 18 37.4 15.5 41.6 15.5" +
  "C47.2 15.5 52 19.5 52 25.5C52 32.5 43.5 39.5 32 48Z";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[12px] bg-brand-solid text-on-brand"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" fill="currentColor" style={{ width: size * 0.62 }}>
        <path d={MARK_PATH} />
      </svg>
    </span>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={34} />
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight text-brand-deep">
          Hackathon Studio
        </span>
        <span className="block text-[11px] font-semibold tracking-wide text-faint">
          KMIDS · 2027
        </span>
      </span>
    </span>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-wash px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={54} />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-brand-deep">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <Ecg className="w-28 text-brand/40" />
        </div>
        <div className="hs-card p-6 shadow-[0_1px_3px_rgba(190,24,93,0.06)]">{children}</div>
        {footer ? <div className="mt-5 text-center text-xs text-faint">{footer}</div> : null}
      </div>
    </main>
  );
}
