/**
 * Field encryption has to be reversible, tolerant of the data that was there
 * before it existed, and safe to run with no key at all. All three matter more
 * than the cipher choice, because all three are how a live portal breaks.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

let encryptField: typeof import("../src/lib/crypto").encryptField;
let decryptField: typeof import("../src/lib/crypto").decryptField;
let safeEqual: typeof import("../src/lib/crypto").safeEqual;
let encryptionAvailable: typeof import("../src/lib/crypto").encryptionAvailable;

before(async () => {
  process.env.AUTH_SECRET = "a-test-secret-that-is-long-enough-to-count";
  const module = await import("../src/lib/crypto");
  encryptField = module.encryptField;
  decryptField = module.decryptField;
  safeEqual = module.safeEqual;
  encryptionAvailable = module.encryptionAvailable;
});

test("a value survives a round trip", () => {
  assert.ok(encryptionAvailable());
  const stored = encryptField("081-234-5678");
  assert.ok(stored);
  assert.notEqual(stored, "081-234-5678", "the plaintext must not be the stored value");
  assert.match(stored!, /^enc\.v1\./);
  assert.equal(decryptField(stored), "081-234-5678");
});

test("the same value encrypts differently every time", () => {
  // A deterministic ciphertext would let anybody holding the table see which
  // two students share a phone number.
  const a = encryptField("@ploy_kmids");
  const b = encryptField("@ploy_kmids");
  assert.notEqual(a, b);
  assert.equal(decryptField(a), decryptField(b));
});

test("empty and null stay null", () => {
  assert.equal(encryptField(null), null);
  assert.equal(encryptField(undefined), null);
  assert.equal(encryptField(""), null);
  assert.equal(decryptField(null), null);
  assert.equal(decryptField(""), null);
});

test("plaintext written before encryption existed still reads back", () => {
  // The migration path: old rows have no prefix and must not become garbage.
  assert.equal(decryptField("081-234-5678"), "081-234-5678");
});

test("a tampered ciphertext decrypts to nothing rather than throwing", () => {
  const stored = encryptField("081-234-5678")!;
  const tampered = `${stored.slice(0, -4)}AAAA`;
  assert.equal(decryptField(tampered), null);
  assert.equal(decryptField("enc.v1.not-even-base64!!"), null);
});

test("unicode survives", () => {
  const thai = "ปฐมพร ศิริชัย";
  assert.equal(decryptField(encryptField(thai)), thai);
});

test("safeEqual compares without leaking length", () => {
  assert.equal(safeEqual("abcdef", "abcdef"), true);
  assert.equal(safeEqual("abcdef", "abcdeg"), false);
  // Different lengths must return false rather than throw, which is what a
  // bare timingSafeEqual does.
  assert.equal(safeEqual("short", "a-much-longer-value"), false);
  assert.equal(safeEqual("", ""), true);
});
