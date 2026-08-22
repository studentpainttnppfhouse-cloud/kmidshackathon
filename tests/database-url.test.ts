import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDatabaseUrl } from "../src/lib/database-url";

const TIDB =
  "mysql://3xAbCd.root:pa55word@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/hackathon_studio";

test("adds sslaccept=strict to a bare TiDB Cloud string", () => {
  assert.equal(normalizeDatabaseUrl(TIDB), `${TIDB}?sslaccept=strict`);
});

test("appends with & when the string already has a query", () => {
  assert.equal(
    normalizeDatabaseUrl(`${TIDB}?connection_limit=5`),
    `${TIDB}?connection_limit=5&sslaccept=strict`,
  );
});

test("leaves an explicit TLS choice alone", () => {
  for (const suffix of [
    "?sslaccept=strict",
    "?sslaccept=accept_invalid_certs",
    "?connection_limit=5&sslmode=require",
  ]) {
    assert.equal(normalizeDatabaseUrl(TIDB + suffix), TIDB + suffix);
  }
});

test("does not force TLS on a local MySQL", () => {
  const local = "mysql://root:root@localhost:3306/hackathon_studio";
  assert.equal(normalizeDatabaseUrl(local), local);
});

test("is idempotent", () => {
  const once = normalizeDatabaseUrl(TIDB)!;
  assert.equal(normalizeDatabaseUrl(once), once);
});

test("trims whitespace picked up from a copy/paste", () => {
  assert.equal(normalizeDatabaseUrl(`  ${TIDB}\n`), `${TIDB}?sslaccept=strict`);
});

test("still works when an unencoded password breaks URL parsing", () => {
  const raw =
    "mysql://3xAbCd.root:p@ss#word@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/hackathon_studio";
  assert.equal(normalizeDatabaseUrl(raw), `${raw}?sslaccept=strict`);
});

test("passes empty values straight through", () => {
  assert.equal(normalizeDatabaseUrl(undefined), undefined);
  assert.equal(normalizeDatabaseUrl(""), "");
});
