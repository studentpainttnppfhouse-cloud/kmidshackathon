import { Ecg } from "@/components/ui";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[12px] bg-brand-solid text-on-brand"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size * 0.55 }}>
        <path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0 1 12 6.5a5.3 5.3 0 0 1 9.3 5.5C19.5 16.3 12 21 12 21z" />
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
