import qrcode from "qrcode-generator";

/**
 * QR codes, as an SVG path.
 *
 * The portal hands out links, and a link is only as good as the effort of
 * typing it. On a poster at the front of a classroom, or on a slide at the
 * first staff meeting, the difference between "scan this" and "type
 * hackathon-studio.onrender.com/join/8Kq..." is the difference between sixty
 * people registering and six.
 *
 * The matrix comes from `qrcode-generator` — a spec-complete encoder with no
 * dependencies of its own. Everything below it is ours, because the shape of
 * the output matters here:
 *
 *   - one `<path>`, not one `<rect>` per module. A 33x33 code is over a
 *     thousand modules; as rectangles that is a hundred kilobytes of markup on
 *     a page that already renders a user list.
 *   - a path string handed to React as a prop, never markup handed to
 *     `dangerouslySetInnerHTML`. The library can emit its own `<svg>` tag and
 *     we deliberately do not use it: injecting a string of SVG is the one
 *     shape of this feature that could ever become an XSS bug.
 *   - `currentColor` for the modules, so the code inverts with the dark theme
 *     instead of turning into a black square on a dark card. The quiet zone is
 *     painted explicitly white underneath, because a scanner needs the
 *     contrast and a theme is not allowed to take it away.
 */

/** Error correction level. "M" recovers ~15% — enough for a printed poster. */
const ERROR_CORRECTION = "M" as const;

/** Modules of white space required around the code by the spec. */
export const QUIET_ZONE = 4;

export type QrMatrix = {
  /** Modules per side, excluding the quiet zone. */
  count: number;
  /** `count + QUIET_ZONE * 2` — the side of the viewBox. */
  size: number;
  /** An SVG path covering every dark module, in viewBox units. */
  path: string;
};

/**
 * Encodes text into a QR matrix, or returns null if it will not fit.
 *
 * Version 40 at level M tops out around 2300 bytes, which no URL this portal
 * produces comes close to — but `addData` throws rather than returning, and a
 * throw here would take down the whole admin page over a decoration. A null
 * lets the caller render the link on its own.
 */
export function qrMatrix(text: string): QrMatrix | null {
  if (text.length === 0 || text.length > 2000) return null;

  let code;
  try {
    // Type number 0 picks the smallest version the data fits into.
    code = qrcode(0, ERROR_CORRECTION);
    code.addData(text);
    code.make();
  } catch {
    return null;
  }

  const count = code.getModuleCount();
  const parts: string[] = [];

  for (let row = 0; row < count; row += 1) {
    let run = 0;

    for (let col = 0; col <= count; col += 1) {
      const dark = col < count && code.isDark(row, col);

      if (dark) {
        run += 1;
        continue;
      }

      // A finished run of dark modules becomes one horizontal bar. Merging
      // them this way is what keeps the path short enough to inline.
      if (run > 0) {
        parts.push(`M${col - run + QUIET_ZONE} ${row + QUIET_ZONE}h${run}v1h-${run}z`);
        run = 0;
      }
    }
  }

  return { count, size: count + QUIET_ZONE * 2, path: parts.join("") };
}
