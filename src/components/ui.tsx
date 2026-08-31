import Link from "next/link";
import type { ReactNode } from "react";
import { safeHref } from "@/lib/url";
import {
  DOC_STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TIER_LABEL,
} from "@/lib/constants";
import type { AssignmentStatus, DocStatus, Priority, Tier } from "@prisma/client";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`hs-card p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="hs-h2">{children}</h2>
      {action}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="hs-eyebrow">{children}</p>;
}

/**
 * The header every index page opens with: eyebrow, title, and the one action
 * that page is for.
 *
 * The action lives up here rather than at the foot of the page because that is
 * where somebody looks for it — the old layout put "New task" below four
 * hundred rows of board, which meant scrolling past everything to add anything.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="hs-enter flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="hs-eyebrow">{eyebrow}</p>
        <h1 className="hs-h1">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </header>
  );
}

/** "Last updated" line. Shown wherever a page's freshness is the question. */
export function LastUpdated({ at, label = "Last updated" }: { at: Date | null; label?: string }) {
  if (!at) return null;
  return (
    <p className="text-xs text-faint">
      {label}{" "}
      <time dateTime={at.toISOString()} title={at.toISOString()}>
        {new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Bangkok",
        }).format(at)}
      </time>{" "}
      (Bangkok)
    </p>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-edge bg-surface/60 px-6 py-10 text-center">
      <Ecg className="w-24 text-brand/40" />
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted">{hint}</p> : null}
      {action}
    </div>
  );
}

/**
 * The recurring heartbeat motif — dividers, empty states, loading.
 *
 * Static by default: as a fixed ornament a half-traced line reads as a
 * rendering glitch. Pass `animate` where the tracing itself is the point.
 */
export function Ecg({ className = "", animate = false }: { className?: string; animate?: boolean }) {
  return (
    <svg
      viewBox="0 0 240 40"
      fill="none"
      aria-hidden="true"
      className={`${animate ? "hs-ecg " : ""}h-6 ${className}`}
      preserveAspectRatio="none"
    >
      <path
        d="M0 20h64l10-13 12 26 12-30 12 34 10-17h110"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-brand/35" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <Ecg className="w-16" animate />
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

const STATUS_STYLE: Record<AssignmentStatus, string> = {
  NOT_STARTED: "bg-neutral-soft text-neutral-strong",
  IN_PROGRESS: "bg-info-soft text-info-strong",
  NEEDS_REVIEW: "bg-warn-soft text-warn-strong",
  APPROVED: "bg-violet-soft text-violet-strong",
  DONE: "bg-ok-soft text-ok-strong",
};

export function StatusPill({ status }: { status: AssignmentStatus }) {
  return <span className={`hs-pill ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

const DOC_STYLE: Record<DocStatus, string> = {
  DRAFT: "bg-neutral-soft text-neutral-strong",
  IN_REVIEW: "bg-warn-soft text-warn-strong",
  APPROVED: "bg-violet-soft text-violet-strong",
  PUBLISHED: "bg-ok-soft text-ok-strong",
};

export function DocStatusPill({ status }: { status: DocStatus }) {
  return <span className={`hs-pill ${DOC_STYLE[status]}`}>{DOC_STATUS_LABEL[status]}</span>;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: "bg-neutral-soft text-neutral-strong",
  MEDIUM: "bg-tint text-brand-deep",
  HIGH: "bg-warn-soft text-warn-strong",
  URGENT: "bg-danger-soft text-danger-strong",
};

export function PriorityPill({ priority }: { priority: Priority }) {
  return <span className={`hs-pill ${PRIORITY_STYLE[priority]}`}>{PRIORITY_LABEL[priority]}</span>;
}

const TIER_STYLE: Record<Tier, string> = {
  T0_ADVISOR: "bg-teal-soft text-teal-strong",
  T1_MEMBER: "bg-neutral-soft text-neutral-strong",
  T2_HEAD: "bg-info-soft text-info-strong",
  T3_ADMIN: "bg-violet-soft text-violet-strong",
  T4_OWNER: "bg-tint-strong text-brand-deep",
};

export function TierPill({ tier }: { tier: Tier }) {
  return <span className={`hs-pill ${TIER_STYLE[tier]}`}>{TIER_LABEL[tier]}</span>;
}

export function Avatar({
  name,
  nickname,
  url,
  size = 36,
}: {
  name: string;
  nickname?: string | null;
  url?: string | null;
  size?: number;
}) {
  const label = nickname || name;
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // An avatar URL is author-controlled and lands in `src`. It is validated on
  // the way in, and again here — a row written before that check existed must
  // render as initials, not as a scheme the browser will execute.
  const src = safeHref(url);

  if (src) {
    return (
      // Remote avatars come from arbitrary Drive/Canva links, so next/image's
      // domain allowlist would be a maintenance burden for no gain here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-tint-strong font-semibold text-brand-deep"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-semibold text-brand-deep">{pct}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-tint-strong"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "default",
  href,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "danger" | "ok";
  href?: string;
}) {
  const toneClass = {
    default: "text-brand-deep",
    warn: "text-warn-strong",
    danger: "text-danger-strong",
    ok: "text-ok-strong",
  }[tone];

  const body = (
    <>
      <p className="hs-eyebrow">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${toneClass}`}>{value}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="hs-card block p-4 transition hover:border-brand">
        {body}
      </Link>
    );
  }
  return <div className="hs-card p-4">{body}</div>;
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "danger" | "ok";
  children: ReactNode;
}) {
  const style = {
    info: "bg-info-soft text-info-strong border-info-edge",
    warn: "bg-warn-soft text-warn-strong border-warn-edge",
    danger: "bg-danger-soft text-danger-strong border-danger-edge",
    ok: "bg-ok-soft text-ok-strong border-ok-edge",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${style}`} role="status">
      {children}
    </div>
  );
}
