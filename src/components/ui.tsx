import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
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
      <h2 className="hs-h2">
        {typeof children === "string" ? <Mixed>{children}</Mixed> : children}
      </h2>
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
        <h1 className="hs-h1">
          <Mixed>{title}</Mixed>
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-[65ch] text-sm text-muted [text-wrap:pretty]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </header>
  );
}

/**
 * The zine masthead — `PageHeader`'s loud sibling.
 *
 * Used on the three surfaces people arrive on rather than work in (dashboard,
 * event day, help), and deliberately *not* on the dense ones: a run of solid
 * pink above an audit log would be shouting over the thing you came to read.
 *
 * It is contained rather than full-bleed. The app shell puts every page inside
 * a padded `max-w-6xl` column, and breaking out of that with negative margins
 * to fake a full-width band is the kind of trick that survives exactly until
 * somebody changes the shell's padding. A panel with an arched top and a
 * scalloped bottom reads as a band and cannot come apart.
 *
 * The bottom is square on purpose: rounding it would clip the outermost
 * scallops into slivers.
 */
export function ZineHeader({
  eyebrow,
  title,
  subtitle,
  action,
  sticker,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Set inline in the headline, in place of the last space. */
  sticker?: ReactNode;
}) {
  return (
    <header className="mb-6 overflow-hidden rounded-t-[28px]">
      <div className="hs-band hs-band-pink relative overflow-hidden px-5 pb-8 pt-9 sm:px-8 sm:pb-10 sm:pt-12">
        {/* No scattered sticker here, deliberately. The masthead is a short
            panel with a title on the left and an action row on the right, which
            leaves only the bottom-right corner — where a drawing lands half
            under a button and half under the scallop and reads as a smudge in
            both themes. Illustration on this surface is carried by the sticker
            set inline in the headline instead. The heroes that do have room
            (sign-in, welcome) scatter properly. */}

        <div className="relative z-[2] flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-[34ch]">
            <p className="hs-rise hs-rise-1 hs-eyebrow text-on-brand">{eyebrow}</p>
            <h1 className="hs-rise hs-rise-2 hs-display-sm">
              <Mixed sticker={sticker}>{title}</Mixed>
            </h1>
            <Ecg
              underline
              className="hs-rise hs-rise-3 mt-1 h-7 w-40 text-on-brand/85 sm:w-52"
            />
            {subtitle ? (
              <p className="mt-3 max-w-[60ch] text-sm text-on-brand/90 [text-wrap:pretty]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div className="relative z-[2] flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
      <Scallop from="pink" to="b" />
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
    <div className="hs-card-arch hs-card-dashed flex flex-col items-center gap-2">
      <Ecg className="mb-1 h-7 w-28 text-marker/60" />
      <p className="text-base font-bold text-ink">
        <Mixed>{title}</Mixed>
      </p>
      {hint ? <p className="max-w-sm text-sm text-muted [text-wrap:pretty]">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/**
 * The recurring heartbeat motif — dividers, empty states, headline underlines.
 *
 * Drawn rather than plotted. The old path was six straight segments off a
 * perfectly flat baseline, which is what made it read as a chart. This one
 * wanders: the baseline drifts a few tenths either side of centre, the spikes
 * are different heights and none of them is symmetrical, and the stroke starts
 * before the left edge and runs past the right so the line looks cut from a
 * longer one rather than drawn to fit.
 *
 * The wobble is in the coordinates, not in an SVG filter — it renders the same
 * on every machine and costs nothing.
 *
 * `preserveAspectRatio` is deliberately *not* "none" here. Stretching the old
 * path was survivable because it was geometric; stretching a hand-drawn one
 * turns the wobble into a smear at wide aspect ratios.
 *
 * Static by default: as a fixed ornament a half-traced line reads as a
 * rendering glitch. Pass `animate` where the tracing itself is the point.
 */
export function Ecg({
  className = "",
  animate = false,
  underline = false,
}: {
  className?: string;
  animate?: boolean;
  /** Draws itself once on arrival, then stops. For headline underlines. */
  underline?: boolean;
}) {
  const motion = underline ? "hs-ecg-underline " : animate ? "hs-ecg " : "";
  return (
    <svg
      viewBox="0 0 240 40"
      fill="none"
      aria-hidden="true"
      className={`hs-ecg-hand ${motion}h-6 ${className}`}
    >
      <path
        d="M-3 20.6c11.4-.7 22.7.5 34.1-.1 10.9-.6 21.7.4 32.6-.2l7.4.3 8.1-12.6 8.7 25.1 8.4-29.4 8.9 33.6 8.2-17.2 7.1 1.1c13.9-.6 27.7.7 41.6 0 12.4-.6 24.8.4 37.2-.3"
        stroke="currentColor"
        strokeWidth="2.6"
      />
    </svg>
  );
}

/**
 * The secondary divider — the ECG on its own, no rules either side.
 *
 * The hairlines that used to flank it were doing the dividing while the
 * heartbeat sat in the middle as a bauble. Now the drawn line is the divider,
 * which is the point of having a motif at all.
 */
export function Divider() {
  return (
    <div className="my-7 flex justify-center text-marker/70" aria-hidden="true">
      <Ecg className="h-8 w-44 sm:w-64" />
    </div>
  );
}

/**
 * The scalloped section edge.
 *
 * Rendered as its own element between two bands rather than as a mask on one
 * of them, which keeps it out of the way of everything inside a section — a
 * masked band clips its own focus rings, and a focus ring you cannot see is an
 * accessibility bug dressed as a shape.
 *
 * `from` is the band above, `to` is the band below. `up` hangs the discs from
 * the lower band into the upper one instead.
 */
const BAND_TOKEN = {
  a: "var(--hs-band-a)",
  b: "var(--hs-band-b)",
  pink: "var(--hs-brand-deep)",
} as const;

export function Scallop({
  from = "a",
  to = "b",
  up = false,
  className = "",
}: {
  from?: keyof typeof BAND_TOKEN;
  to?: keyof typeof BAND_TOKEN;
  up?: boolean;
  className?: string;
}) {
  // The two grounds are passed as custom properties rather than picked from a
  // list of pre-named pairs. Three bands would have needed nine classes and
  // every new ground would have needed three more; this way the stylesheet
  // holds the shape and the call site holds the colours.
  return (
    <div
      aria-hidden="true"
      className={`hs-scallop ${up ? "hs-scallop-up" : ""} ${className}`}
      style={
        {
          "--scallop-from": BAND_TOKEN[from],
          "--scallop-to": BAND_TOKEN[to],
        } as CSSProperties
      }
    />
  );
}

/**
 * The mid-headline voice switch, applied as a rule rather than by hand.
 *
 * Every heading on the portal sets its last word in the italic serif: "Run
 * *sheet*", "Staff *sign-in*", "Event *day*". A single-word heading goes italic
 * whole, so the system is still visible on "Assignments" and "Documents".
 *
 * Doing it by rule rather than per call site is what makes it a system instead
 * of a flourish on the hero — and it means no page's copy had to change to get
 * it, which was a hard constraint here.
 */
export function Mixed({ children, sticker }: { children: string; sticker?: ReactNode }) {
  const words = children.trim().split(/\s+/);
  // A <span>, not an <em>. The switch is typographic, not emphatic — an <em>
  // here would have assistive technology stressing the last word of every
  // heading in the portal.
  if (words.length < 2) return <span className="hs-em">{children}</span>;
  const head = words.slice(0, -1).join(" ");
  const tail = words[words.length - 1];
  // A sticker stands in for the space before the italic word rather than being
  // parked beside the heading. That is the difference between illustration set
  // *in* the type and illustration decorating it.
  return (
    <>
      {head}
      {sticker ?? " "}
      <span className="hs-em">{tail}</span>
    </>
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
      <p className="text-[0.8125rem] font-medium text-muted">{label}</p>
      <p className={`mt-0.5 text-[1.75rem] font-extrabold leading-none tracking-[-0.03em] ${toneClass}`}>
        {value}
      </p>
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
    <div className={`rounded-2xl border-2 px-4 py-3 text-sm ${style}`} role="status">
      {children}
    </div>
  );
}
