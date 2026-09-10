import type { SVGProps } from "react";

/**
 * Flat health stickers, drawn rather than iconified.
 *
 * Three rules hold the set together, and they are the difference between this
 * and a polished icon library:
 *
 *   1. One ink weight. Every outline is 3 units on a 48 viewBox with round
 *      caps and joins, so at any size they read as the same marker.
 *   2. The paths are off. Ends overshoot, verticals lean, circles are not quite
 *      circles. That irregularity is authored into the coordinates, not applied
 *      as a filter, so it renders identically everywhere and costs nothing.
 *   3. Flat fills only — no gradient, no shadow, no highlight.
 *
 * Colour comes from a dedicated five-token set (`--sticker-ink`, `-fill`,
 * `-alt`, `-paper`, `-wash`) rather than from the semantic roles. That
 * indirection is what lets the same drawings sit on white, on blush and on a
 * solid pink panel without a second copy of the set — and what lets dark mode
 * lift the marker to a light pink the way the rest of the brand does — while
 * keeping the flip contained to illustration, so re-tinting a sticker can
 * never accidentally re-tint a button.
 *
 * All of them are decoration and every one is `aria-hidden`. Nothing here ever
 * carries meaning a screen reader would need.
 */

type StickerProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** A few degrees of tilt. Scattered stickers should not all sit upright. */
  tilt?: number;
};

function Sticker({ tilt = 0, className = "", style, ...rest }: StickerProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`hs-sticker ${className}`}
      style={tilt ? { ...style, rotate: `${tilt}deg` } : style}
      {...rest}
    />
  );
}

/** Shared ink. `marker` is a token, so dark mode lifts it without a second set. */
const ink = {
  stroke: "var(--sticker-ink)",
  strokeWidth: 3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The first-aid cross. Corners rounded unevenly, on purpose. */
export function StickerCross(props: StickerProps) {
  return (
    <Sticker {...props}>
      <path
        d="M19.4 5.2h9.4a2.4 2.4 0 0 1 2.3 2.5v11.4h11.6a2.3 2.3 0 0 1 2.4 2.4v9.2a2.4 2.4 0 0 1 -2.4 2.4H31.1v11.7a2.3 2.3 0 0 1 -2.4 2.3h-9.3a2.4 2.4 0 0 1 -2.3 -2.4V33.1H5.6a2.3 2.3 0 0 1 -2.3 -2.4v-9.3a2.4 2.4 0 0 1 2.4 -2.3h11.4V7.6a2.3 2.3 0 0 1 2.3 -2.4z"
        fill="var(--sticker-fill)"
        {...ink}
      />
    </Sticker>
  );
}

/** A capsule, half filled. The dividing line runs slightly off centre. */
export function StickerPill(props: StickerProps) {
  return (
    <Sticker {...props}>
      <g transform="rotate(-33 24 24)">
        <rect
          x="7.5"
          y="16.6"
          width="33"
          height="15.2"
          rx="7.6"
          fill="var(--sticker-paper)"
          {...ink}
        />
        <path
          d="M15.2 16.6h8.9v15.2h-8.9a7.6 7.6 0 0 1 0 -15.2z"
          fill="var(--sticker-fill)"
        />
        <path d="M7.6 24.3a7.6 7.6 0 0 1 7.6 -7.7h8.9v15.2h-8.9a7.6 7.6 0 0 1 -7.6 -7.5z" {...ink} />
        <path d="M24.1 16.8v14.9" {...ink} />
      </g>
    </Sticker>
  );
}

/** Thermometer. The tube leans a degree off vertical and the ticks disagree. */
export function StickerThermometer(props: StickerProps) {
  return (
    <Sticker {...props}>
      <path
        d="M20.2 33.4V11.6a4.1 4.1 0 0 1 8.2 -0.2v22"
        fill="var(--sticker-paper)"
        {...ink}
      />
      <circle cx="24.2" cy="37.6" r="6.6" fill="var(--sticker-fill)" {...ink} />
      <path d="M24.3 31.8v-9.4" stroke="var(--sticker-fill)" strokeWidth={3.4} strokeLinecap="round" />
      <path d="M30.6 17.4h3.7M30.4 23.1h2.9" {...ink} strokeWidth={2.4} />
    </Sticker>
  );
}

/** A droplet, fatter on one side than the other. */
export function StickerDroplet(props: StickerProps) {
  return (
    <Sticker {...props}>
      <path
        d="M24.1 4.8s13.4 15.9 13.4 24.6a13.3 13.3 0 0 1 -26.6 0.4C10.9 21 24.1 4.8 24.1 4.8z"
        fill="var(--sticker-alt)"
        {...ink}
      />
      <path d="M17.6 29.9a6.6 6.6 0 0 0 3.1 6.2" {...ink} strokeWidth={2.4} />
    </Sticker>
  );
}

/** The heart, with a pulse running straight through it. */
export function StickerHeartbeat(props: StickerProps) {
  return (
    <Sticker {...props}>
      <path
        d="M24.2 42.4C12.1 33.6 4.9 27.3 4.9 20.1c0-6.1 4.9-10.2 10.6-10.2 3.7 0 6.9 2.6 8.7 5.9 1.9-3.3 5.1-5.8 8.8-5.8 5.7 0 10.5 4.2 10.4 10.3 0 7.2-7.3 13.4-19.2 22.1z"
        fill="var(--sticker-fill)"
        {...ink}
      />
      <path
        d="M6.4 24.6h7.9l3.4-6.4 4.8 12.7 4.1-9.3 3.3 3.1h11.8"
        stroke="var(--sticker-paper)"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Sticker>
  );
}

/** Adhesive strip, tilted, with a pad of dots that are not evenly spaced. */
export function StickerBandage(props: StickerProps) {
  return (
    <Sticker {...props}>
      <g transform="rotate(-38 24 24)">
        <rect
          x="3.4"
          y="17.6"
          width="41.4"
          height="13.4"
          rx="6.7"
          fill="var(--sticker-wash)"
          {...ink}
        />
        <rect
          x="16.9"
          y="17.7"
          width="14.4"
          height="13.2"
          fill="var(--sticker-fill)"
          stroke="var(--sticker-ink)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <circle cx="21.2" cy="21.9" r="1.5" fill="var(--sticker-paper)" />
        <circle cx="27.1" cy="22.2" r="1.5" fill="var(--sticker-paper)" />
        <circle cx="20.9" cy="27.1" r="1.5" fill="var(--sticker-paper)" />
        <circle cx="26.9" cy="26.8" r="1.5" fill="var(--sticker-paper)" />
      </g>
    </Sticker>
  );
}

/** Stethoscope. The tube is one stroke that wanders on its way down. */
export function StickerStethoscope(props: StickerProps) {
  return (
    <Sticker {...props}>
      <path
        d="M13.6 9.4v9.8a10.4 10.4 0 0 0 20.7 0.3V9.2"
        fill="none"
        {...ink}
      />
      <path d="M13.5 6.6v3.1M34.4 6.4v3.2" {...ink} strokeWidth={4.4} />
      <path
        d="M24 29.9v5.4c0.1 4.8 3.8 7.1 7.9 6.9"
        fill="none"
        {...ink}
      />
      <circle cx="37.4" cy="41.7" r="5.3" fill="var(--sticker-alt)" {...ink} />
    </Sticker>
  );
}

/** The whole set, for surfaces that scatter rather than pick. */
export const STICKERS = [
  StickerCross,
  StickerPill,
  StickerThermometer,
  StickerDroplet,
  StickerHeartbeat,
  StickerBandage,
  StickerStethoscope,
] as const;
