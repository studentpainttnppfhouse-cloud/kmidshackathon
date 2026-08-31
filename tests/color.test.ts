/**
 * Department colours are chosen by staff and end up behind white text. The
 * question this file settles is not "is the maths right" but "does every
 * colour anyone has actually picked end up readable" — because
 * white-on-#22C55E, which is what the portal used to render, is 2.3:1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deepen, swatchStyle } from "../src/lib/color";

/** WCAG 2.1 contrast, computed independently of the implementation. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const [r, g, bl] = [0, 2, 4]
      .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The seeded department palette, plus the extremes and the awkward middle. */
const SWATCHES = [
  "#EC4899",
  "#8B5CF6",
  "#0EA5E9",
  "#F59E0B",
  "#22C55E",
  "#2DD4BF",
  "#BE185D",
  "#FFFFFF",
  "#FFFF00",
  "#808080",
  "#000000",
];

test("white text clears AA on every deepened swatch", () => {
  for (const swatch of SWATCHES) {
    const ratio = contrast("#ffffff", deepen(swatch));
    assert.ok(
      ratio >= 4.5,
      `${swatch} deepened to ${deepen(swatch)} is only ${ratio.toFixed(2)}:1`,
    );
  }
});

test("a colour that already passes is left exactly as it was", () => {
  // #BE185D is 6.0:1 against white; touching it would be a gratuitous
  // change to a department's chosen colour.
  assert.equal(deepen("#BE185D"), "#BE185D");
  assert.equal(deepen("#000000"), "#000000");
});

test("deepening holds the hue rather than sliding towards grey", () => {
  // Amber stays amber: red still dominates green, and blue stays at the floor.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(deepen("#F59E0B").slice(i, i + 2), 16));
  assert.ok(r > g && g > b, `#F59E0B deepened to ${deepen("#F59E0B")}`);

  // Green stays green.
  const green = deepen("#22C55E");
  const [gr, gg, gb] = [1, 3, 5].map((i) => parseInt(green.slice(i, i + 2), 16));
  assert.ok(gg > gr && gg > gb, `#22C55E deepened to ${green}`);
});

test("shorthand hex is understood", () => {
  assert.equal(contrast("#ffffff", deepen("#fff")) >= 4.5, true);
});

test("a malformed or missing colour falls back to the theme's brand pairing", () => {
  // Never `undefined` in the style attribute, and never white on white.
  for (const bad of [null, undefined, "", "red", "#12", "javascript:alert(1)"]) {
    const style = swatchStyle(bad);
    assert.equal(style.background, "var(--hs-brand-solid)");
    assert.equal(style.color, "var(--hs-on-brand)");
  }
});

test("a valid colour is passed through deepened, with white on it", () => {
  assert.deepEqual(swatchStyle("#0EA5E9"), { background: deepen("#0EA5E9"), color: "#ffffff" });
});
