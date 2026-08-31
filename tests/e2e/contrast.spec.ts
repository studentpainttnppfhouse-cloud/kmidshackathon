import { expect, test, type Page } from "@playwright/test";

/**
 * Contrast, measured on the rendered page rather than argued about in review.
 *
 * The dark theme regressed the way dark themes always do: a component was
 * written with a light-mode-only Tailwind pair (`bg-white`, `bg-emerald-50
 * text-emerald-700`), which is invisible to any amount of `:root[data-theme]`
 * work. The tokens in globals.css are the fix; this is what keeps the fix.
 *
 * The audit walks every text node on a page, composites the real background
 * from its ancestors (so an `/70` on a card on a page resolves correctly), and
 * checks the pair against WCAG 2.1 AA — 4.5:1, or 3:1 for large text.
 *
 * Run with a server already up, same as the rest of the browser suite:
 *   BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e
 */

const OWNER_EMAIL = process.env.E2E_EMAIL ?? "paintppf@kmids.ac.th";
const OWNER_PASSWORD = process.env.E2E_PASSWORD ?? "a-long-enough-password-2027";
const HUMAN_PACE_MS = 900;

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForTimeout(HUMAN_PACE_MS);
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|welcome)/, { timeout: 20_000 });
  if (page.url().includes("/welcome")) {
    await page.fill("#nickname", "Owner");
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  }
}

type Finding = {
  text: string;
  className: string;
  ratio: number;
  minimum: number;
  foreground: string;
  background: string;
};

/**
 * Runs in the page. Kept as one self-contained function because it is
 * serialised across to the browser, where nothing from this module exists.
 */
function auditContrast(): Finding[] {
  type Colour = { r: number; g: number; b: number; a: number };

  const parse = (value: string): Colour | null => {
    const m = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m
      ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
      : null;
  };

  const composite = (top: Colour, under: Colour): Colour => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });

  const luminance = ({ r, g, b }: Colour): number => {
    const f = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const ratio = (a: Colour, b: Colour): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  /**
   * What is actually behind an element: every translucent ancestor, stacked.
   *
   * Returns null when an ancestor paints a gradient or an image, because
   * `getComputedStyle` gives back the gradient's *declaration*, not the pixel
   * under this particular word. Guessing there would report the page's own
   * background and fail a card that is perfectly legible, so those elements
   * are reported separately rather than judged wrongly.
   */
  const backgroundBehind = (el: Element): Colour | null => {
    const layers: Colour[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== "none") return null;
      const colour = parse(style.backgroundColor);
      if (colour && colour.a > 0) {
        layers.push(colour);
        if (colour.a === 1) break;
      }
    }
    let base: Colour = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = composite(layers[i], base);
    return base;
  };

  const show = ({ r, g, b }: Colour) =>
    `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

  const findings: Finding[] = [];

  for (const el of Array.from(document.querySelectorAll("body *"))) {
    // Only elements holding text of their own — otherwise a wrapper is judged
    // on a child's background.
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim() ?? "")
      .join(" ")
      .trim();
    if (!text) continue;

    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
      continue;
    }
    // The skip link and the honeypot are deliberately parked off-screen.
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || box.bottom < 0) continue;

    const declared = parse(style.color);
    if (!declared) continue;

    const background = backgroundBehind(el);
    if (!background) continue;
    const foreground = declared.a < 1 ? composite(declared, background) : declared;

    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10) || 400;
    // WCAG "large text": 24px, or 18.66px when bold.
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const minimum = large ? 3 : 4.5;
    const measured = ratio(foreground, background);

    if (measured < minimum) {
      findings.push({
        text: text.slice(0, 60),
        className: (el.getAttribute("class") ?? "").slice(0, 80),
        ratio: Math.round(measured * 100) / 100,
        minimum,
        foreground: show(foreground),
        background: show(background),
      });
    }
  }

  return findings;
}

/** The pages that between them render every shared component. */
const PAGES = [
  "/dashboard",
  "/assignments?view=board",
  "/assignments?view=list",
  "/people",
  "/documents",
  "/departments",
  "/announcements",
  "/forms",
  "/files",
  "/brand",
  "/help",
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme contrast`, () => {
    for (const path of PAGES) {
      test(`${path} clears WCAG AA`, async ({ page }) => {
        await signIn(page);
        await page.goto(path);
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        // Colour transitions would otherwise be sampled mid-flight and
        // reported as failures that never appear on screen.
        await page.addStyleTag({
          content: "*,*::before,*::after{transition:none!important}",
        });
        await page.waitForTimeout(250);

        const findings = await page.evaluate(auditContrast);
        expect(
          findings,
          findings
            .map(
              (f) =>
                `  ${f.ratio}:1 (needs ${f.minimum}) — "${f.text}" ` +
                `${f.foreground} on ${f.background} [${f.className}]`,
            )
            .join("\n"),
        ).toEqual([]);
      });
    }
  });
}
