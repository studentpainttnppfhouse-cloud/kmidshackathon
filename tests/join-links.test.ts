/**
 * A join link is a bearer token printed on a poster.
 *
 * Everything that keeps that from being reckless is in one small function and
 * one constant, and both are checked here: the gate that decides whether a
 * link still works, and the ceiling on what any link may ever grant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { JOIN_LINK_MESSAGE, joinLinkStatus, joinLinkMessage, usesLabel } from "../src/lib/join-links";
import { JOIN_LINK_MAX_TIER, JOIN_LINK_MAX_USES, TIER_ORDER } from "../src/lib/constants";

const HOUR = 60 * 60 * 1000;

function link(over: Partial<Parameters<typeof joinLinkStatus>[0]> = {}) {
  return {
    revokedAt: null,
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    ...over,
  } as NonNullable<Parameters<typeof joinLinkStatus>[0]>;
}

test("a fresh link with no limits works", () => {
  assert.equal(joinLinkStatus(link()), "ok");
  assert.equal(joinLinkMessage("ok"), "");
});

test("a link nobody made does not work", () => {
  assert.equal(joinLinkStatus(null), "missing");
});

test("switching a link off stops every copy of it at once", () => {
  assert.equal(joinLinkStatus(link({ revokedAt: new Date(Date.now() - HOUR) })), "revoked");
  // Revocation beats a link that would otherwise still be fine.
  assert.equal(
    joinLinkStatus(link({ revokedAt: new Date(), expiresAt: new Date(Date.now() + HOUR) })),
    "revoked",
  );
});

test("expiry is checked at the moment somebody uses it", () => {
  assert.equal(joinLinkStatus(link({ expiresAt: new Date(Date.now() - 1000) })), "expired");
  assert.equal(joinLinkStatus(link({ expiresAt: new Date(Date.now() + HOUR) })), "ok");
});

test("the use ceiling is a ceiling, not a suggestion", () => {
  assert.equal(joinLinkStatus(link({ maxUses: 60, useCount: 59 })), "ok");
  assert.equal(joinLinkStatus(link({ maxUses: 60, useCount: 60 })), "full");
  // A count that somehow overshot still refuses rather than wrapping round.
  assert.equal(joinLinkStatus(link({ maxUses: 60, useCount: 99 })), "full");
  // Null means no ceiling, which is a real choice an admin can make.
  assert.equal(joinLinkStatus(link({ maxUses: null, useCount: 5000 })), "ok");
});

test("every refusal has a message, and none of them names a code", () => {
  for (const status of ["missing", "revoked", "expired", "full"] as const) {
    const message = JOIN_LINK_MESSAGE[status];
    assert.ok(message.length > 0, status);
    assert.equal(joinLinkMessage(status), message);
    assert.ok(!message.includes("/join/"), "a message must not echo a link back");
  }
});

test("a self-serve link can never mint an admin", () => {
  // The whole safety argument for putting a link on a poster: whoever picks it
  // up gets an account that cannot administer anything.
  assert.ok(TIER_ORDER[JOIN_LINK_MAX_TIER] < TIER_ORDER.T3_ADMIN);
  assert.ok(TIER_ORDER[JOIN_LINK_MAX_TIER] < TIER_ORDER.T4_OWNER);
});

test("a link cannot be typed into being unlimited by accident", () => {
  assert.ok(JOIN_LINK_MAX_USES > 0);
  assert.ok(JOIN_LINK_MAX_USES <= 1000, "a school portal does not need more than this");
});

test("the uses label says what an admin needs to decide with", () => {
  assert.equal(usesLabel({ useCount: 18, maxUses: 50 }), "18 of 50 used");
  assert.equal(usesLabel({ useCount: 3, maxUses: null }), "3 used");
  assert.equal(usesLabel({ useCount: 0, maxUses: 60 }), "0 of 60 used");
});
