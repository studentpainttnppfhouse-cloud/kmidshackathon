/**
 * The throttle is what stands between the sign-in form and a password spray.
 * These check the shape of it — that it lets normal use through, blocks a
 * burst, and does not accidentally lock the whole portal out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, clearRateLimit, rateLimit, retryMessage } from "../src/lib/rate-limit";

const RULE = { limit: 3, windowMs: 60_000, blockMs: 60_000 };

function key(name: string): string {
  return `${name}-${Math.random().toString(36).slice(2)}`;
}

test("attempts inside the limit are allowed", () => {
  const k = key("ok");
  for (let i = 0; i < RULE.limit; i += 1) {
    assert.equal(rateLimit(k, RULE).ok, true, `attempt ${i + 1} should pass`);
  }
});

test("one attempt past the limit blocks", () => {
  const k = key("burst");
  for (let i = 0; i < RULE.limit; i += 1) rateLimit(k, RULE);

  const blocked = rateLimit(k, RULE);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter > 0);
});

test("a block persists for subsequent attempts", () => {
  const k = key("persist");
  for (let i = 0; i < RULE.limit + 1; i += 1) rateLimit(k, RULE);

  assert.equal(rateLimit(k, RULE).ok, false);
  assert.equal(rateLimit(k, RULE).ok, false);
});

test("keys are independent — one address cannot lock out another", () => {
  const attacker = key("attacker");
  const bystander = key("bystander");

  for (let i = 0; i < RULE.limit + 2; i += 1) rateLimit(attacker, RULE);

  assert.equal(rateLimit(attacker, RULE).ok, false);
  assert.equal(rateLimit(bystander, RULE).ok, true, "an unrelated key must be unaffected");
});

test("a successful sign-in clears the record", () => {
  const k = key("clear");
  rateLimit(k, RULE);
  rateLimit(k, RULE);
  clearRateLimit(k);

  // Back to a full allowance.
  for (let i = 0; i < RULE.limit; i += 1) {
    assert.equal(rateLimit(k, RULE).ok, true);
  }
});

test("the shipped rules leave room for ordinary use", () => {
  // A person mistyping a password three times must never be throttled; the
  // limit exists for scripts, not for people having a bad morning.
  assert.ok(RULES.login.limit >= 10, "login limit should tolerate real mistakes");
  assert.ok(RULES.code.limit >= 5);
  assert.ok(RULES.write.limit >= 30, "writing should not feel rationed");
  assert.ok(RULES.login.blockMs <= 30 * 60 * 1000, "a block should not last a lesson");
});

test("the retry message is in minutes and never says zero", () => {
  assert.match(retryMessage(30), /a minute/);
  assert.match(retryMessage(900), /15 minutes/);
});
