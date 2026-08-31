/**
 * Department colours are author-chosen and land straight in a `style`
 * attribute, behind white text.
 *
 * Several of the seeded ones are mid-tones — #F59E0B, #22C55E, #2DD4BF — and
 * white on those is 2:1 or worse, in *both* themes. Picking black instead does
 * not rescue them either: for any two fixed inks there is a band of colours in
 * the middle that fails against both, and #EC4899, the brand itself, sits in
 * it. The dark theme used to paper over this with a blanket `filter:
 * brightness()` on every pill, which fixed the contrast by ruining the colour.
 *
 * So darken the swatch instead of arguing about the ink: keep its hue and its
 * relative channel mix, walk its lightness down until white text clears AA on
 * it, and use it as-is if it already does. A department that chose a deep
 * colour sees no change; one that chose highlighter yellow gets a deeper
 * yellow rather than an unreadable one. The result is a single value that is
 * correct in both themes, so it can be computed on the server.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** WCAG AA for the small, bold text these chips carry. */
const TARGET = 4.5;

type Rgb = [number, number, number];

function channels(hex: string): Rgb | null {
  if (!HEX.test(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contrast of a colour against white, which is what these chips put on it. */
function contrastWithWhite(rgb: Rgb): number {
  return 1.05 / (luminance(rgb) + 0.05);
}

/**
 * The same colour, darkened just far enough that white text on it clears AA.
 * Scaling all three channels by one factor holds the hue and saturation ratio
 * steady, so the result still reads as the department's colour.
 */
export function deepen(hex: string): string {
  const rgb = channels(hex);
  if (!rgb) return hex;
  if (contrastWithWhite(rgb) >= TARGET) return hex;

  // Binary search the scale factor. Twenty steps is far past 8-bit precision.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (contrastWithWhite(rgb.map((c) => c * mid) as Rgb) >= TARGET) lo = mid;
    else hi = mid;
  }
  return toHex(rgb.map((c) => Math.floor(c * lo)) as Rgb);
}

/**
 * Inline style for a chip filled with a department's colour. An unset or
 * malformed colour falls back to the theme's own solid brand pairing rather
 * than to a bare `undefined`, which would render white on white.
 */
export function swatchStyle(hex: string | null | undefined): {
  background: string;
  color: string;
} {
  return HEX.test(hex ?? "")
    ? { background: deepen(hex as string), color: "#ffffff" }
    : { background: "var(--hs-brand-solid)", color: "var(--hs-on-brand)" };
}
