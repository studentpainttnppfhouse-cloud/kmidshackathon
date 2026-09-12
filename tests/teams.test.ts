/**
 * Teams notifications: the parts that are worth testing without a network.
 *
 * Three things are checked here, chosen because each one is a place where a
 * quiet mistake would be invisible until it mattered:
 *
 *   1. the webhook host allowlist, which is an SSRF control
 *   2. the Adaptive Card builder, where message text meets markup
 *   3. the Bangkok time conversion the run sheet reminders depend on
 *
 * Nothing here talks to Microsoft, and nothing needs a database.
 *
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCard, plainText, previewLine } from "../src/lib/teams/card";
import { bangkokInstant } from "../src/lib/teams/notify";

// ---------------------------------------------------------------------------
// The host allowlist
//
// Imported lazily inside each test: config.ts reads process.env at call time,
// so a test that changes TEAMS_WEBHOOK_HOSTS has to import after setting it.
// ---------------------------------------------------------------------------

async function check(url: string) {
  const { checkWebhookUrl } = await import("../src/lib/teams/config");
  return checkWebhookUrl(url);
}

test("accepts a Power Automate workflow URL", async () => {
  const result = await check(
    "https://prod-12.southeastasia.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=xyz",
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.host, "prod-12.southeastasia.logic.azure.com");
    assert.equal(result.hint, "=xyz");
  }
});

test("accepts a classic Incoming Webhook URL", async () => {
  const result = await check("https://kmids.webhook.office.com/webhookb2/abc@def/IncomingWebhook/x/y");
  assert.equal(result.ok, true);
});

test("refuses the cloud metadata service", async () => {
  const result = await check("http://169.254.169.254/latest/meta-data/");
  assert.equal(result.ok, false);
});

test("refuses a host that merely contains an allowed one", async () => {
  // The check is a suffix match on a dot boundary, so this attacker-controlled
  // domain must not pass just because the allowed name appears inside it.
  const result = await check("https://logic.azure.com.evil.example/hook");
  assert.equal(result.ok, false);
});

test("refuses plain http even on an allowed host", async () => {
  const result = await check("http://kmids.webhook.office.com/webhookb2/abc");
  assert.equal(result.ok, false);
});

test("refuses a URL carrying credentials", async () => {
  const result = await check("https://user:pass@kmids.webhook.office.com/webhookb2/abc");
  assert.equal(result.ok, false);
});

test("refuses javascript: and other schemes", async () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd"]) {
    assert.equal((await check(url)).ok, false, url);
  }
});

// ---------------------------------------------------------------------------
// Card building
// ---------------------------------------------------------------------------

test("a message body cannot forge a mention", () => {
  const card = buildCard({
    kind: "MANUAL",
    title: "Hello",
    body: "<at>Head of Graphics</at> said this is fine",
  });

  const content = card.attachments[0].content as {
    body: { type: string; text?: string }[];
    msteams: { entities: unknown[] };
  };

  const texts = content.body.map((block) => block.text ?? "").join(" ");
  assert.ok(!texts.includes("<at>"), "angle brackets must not survive into the card");
  assert.equal(content.msteams.entities.length, 0, "no entity means no real mention");
});

test("a mention declares a matching entity", () => {
  const card = buildCard({
    kind: "ASSIGNMENT_DUE",
    title: "Poster files",
    body: "Due tomorrow",
    mentions: [{ id: "paint@kmids.ac.th", name: "Paint" }],
  });

  const content = card.attachments[0].content as {
    body: { text?: string }[];
    msteams: { entities: { text: string; mentioned: { id: string } }[] };
  };

  assert.equal(content.msteams.entities.length, 1);
  assert.equal(content.msteams.entities[0].text, "<at>Paint</at>");
  assert.equal(content.msteams.entities[0].mentioned.id, "paint@kmids.ac.th");
  assert.ok(content.body.some((block) => (block.text ?? "").includes("<at>Paint</at>")));
});

test("a display name cannot close the mention tag early", () => {
  const card = buildCard({
    kind: "MANUAL",
    title: "x",
    body: "y",
    mentions: [{ id: "a@b.c", name: "</at><at>Someone Else" }],
  });

  const content = card.attachments[0].content as {
    msteams: { entities: { text: string; mentioned: { name: string } }[] };
  };

  // Exactly one mention, and its tag opens and closes exactly once: the angle
  // brackets from the injected name are gone, so the name cannot end the run
  // early and start a second, forged one.
  assert.equal(content.msteams.entities.length, 1);
  const tag = content.msteams.entities[0].text;
  assert.equal(tag, "<at>/atatSomeone Else</at>");
  assert.equal(tag.match(/</g)?.length, 2);
  assert.equal(tag.match(/>/g)?.length, 2);
  assert.ok(!content.msteams.entities[0].mentioned.name.includes("<"));
});

test("only http(s) links become a button", () => {
  const withLink = buildCard({
    kind: "MANUAL",
    title: "x",
    body: "y",
    url: "https://portal.example/assignments/1",
  });
  assert.ok("actions" in (withLink.attachments[0].content as Record<string, unknown>));

  const withBadLink = buildCard({
    kind: "MANUAL",
    title: "x",
    body: "y",
    url: "javascript:alert(1)",
  });
  assert.ok(!("actions" in (withBadLink.attachments[0].content as Record<string, unknown>)));
});

test("empty facts are dropped rather than rendered blank", () => {
  const card = buildCard({
    kind: "MANUAL",
    title: "x",
    body: "y",
    facts: [
      { label: "Due", value: "" },
      { label: "Owner", value: "Paint" },
    ],
  });

  const content = card.attachments[0].content as {
    body: { type: string; facts?: { title: string }[] }[];
  };
  const factSet = content.body.find((block) => block.type === "FactSet");
  assert.equal(factSet?.facts?.length, 1);
});

test("plainText truncates and trims", () => {
  assert.equal(plainText("  hello  "), "hello");
  assert.equal(plainText("abcdef", 3), "abc");
});

test("previewLine names the kind", () => {
  assert.equal(previewLine({ kind: "ASSIGNMENT_OVERDUE", title: "Poster" }), "Overdue: Poster");
});

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

test("a run sheet time is read as Bangkok, not UTC", () => {
  // 08:00 ICT on event day is 01:00 UTC. Getting this wrong by seven hours
  // would send every run sheet reminder in the middle of the night.
  const at = bangkokInstant("2027-03-20", "08:00");
  assert.equal(at?.toISOString(), "2027-03-20T01:00:00.000Z");
});

test("a malformed run sheet time is null rather than Invalid Date", () => {
  assert.equal(bangkokInstant("not-a-day", "08:00"), null);
  assert.equal(bangkokInstant("2027-03-20", "lunchtime"), null);
  assert.equal(bangkokInstant("2027-03-20", "99:00"), null);
});
