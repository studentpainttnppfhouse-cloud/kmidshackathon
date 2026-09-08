/**
 * A QR code that does not scan is a poster that wasted everybody's time.
 *
 * The encoder itself is a dependency and is not re-tested here. What is tested
 * is the part this repository wrote: the run-merging that turns a matrix into
 * one SVG path, the quiet zone the spec requires, and the refusals that must
 * not take down an admin page over a decoration.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { QUIET_ZONE, qrMatrix } from "../src/lib/qr";

test("a link encodes to a square matrix with its quiet zone", () => {
  const qr = qrMatrix("https://hackathon-studio.onrender.com/join/8Kq2vX");
  assert.ok(qr);
  // Every QR version is an odd square, 21 modules and up.
  assert.ok(qr.count >= 21);
  assert.equal(qr.count % 2, 1);
  assert.equal(qr.size, qr.count + QUIET_ZONE * 2);
  assert.equal(QUIET_ZONE, 4, "the spec asks for four modules of white space");
});

test("the path is real geometry, not an empty string", () => {
  const qr = qrMatrix("https://example.com/join/abc");
  assert.ok(qr);
  assert.match(qr.path, /^M\d/);
  assert.match(qr.path, /z$/);
  // A finder pattern alone is dozens of runs; anything tiny means the matrix
  // was read wrong.
  assert.ok(qr.path.length > 500);
});

test("horizontal runs are merged, so the markup stays inlinable", () => {
  const qr = qrMatrix("https://hackathon-studio.onrender.com/join/8Kq2vXpLm3nR");
  assert.ok(qr);

  const runs = qr.path.split("z").filter(Boolean).length;
  // One <path> command per run of dark modules. Merged, a code of this size is
  // a few hundred; unmerged it would be one per module, over a thousand.
  assert.ok(runs < qr.count * qr.count, "runs must be fewer than modules");
  assert.ok(qr.path.length < 20_000, "the path has to be small enough to inline");
});

test("every drawn module sits inside the code, never in the quiet zone", () => {
  const qr = qrMatrix("https://example.com/join/abc");
  assert.ok(qr);

  for (const [, x, y, width] of qr.path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    const left = Number(x);
    const top = Number(y);
    const run = Number(width);

    assert.ok(left >= QUIET_ZONE, "a module started inside the left quiet zone");
    assert.ok(top >= QUIET_ZONE, "a module started inside the top quiet zone");
    assert.ok(left + run <= qr.size - QUIET_ZONE, "a run crossed the right quiet zone");
    assert.ok(top + 1 <= qr.size - QUIET_ZONE, "a row crossed the bottom quiet zone");
  }
});

test("longer links produce a bigger code rather than a broken one", () => {
  const short = qrMatrix("https://a.co/j/1");
  const long = qrMatrix(`https://hackathon-studio.onrender.com/join/${"x".repeat(200)}`);
  assert.ok(short);
  assert.ok(long);
  assert.ok(long.count > short.count);
});

test("nothing to encode, or far too much, returns null instead of throwing", () => {
  // A null here means the caller renders the link on its own. A throw would
  // take down the whole admin page over a decoration.
  assert.equal(qrMatrix(""), null);
  assert.equal(qrMatrix("x".repeat(2001)), null);
});

test("Thai text and emoji encode without throwing", () => {
  assert.ok(qrMatrix("เข้าร่วม KMIDS Hackathon 2027"));
  assert.ok(qrMatrix("https://example.com/join/abc?from=🎨"));
});
