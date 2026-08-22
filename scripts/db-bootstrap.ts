/**
 * Makes a database usable — at build time, and again on every boot.
 *
 * The deploy that produced
 *
 *   PrismaClientKnownRequestError P2021:
 *   The table `users` does not exist in the current database.
 *
 * was a service whose build command never ran `prisma migrate deploy`, so the
 * schema was never created: Node started, the health check passed (TiDB answers
 * `SELECT 1` from an empty database quite happily) and the first page that
 * touched a table crashed.
 *
 * A forgotten migration step should not be able to do that again, so `npm
 * start` runs this first (see the `prestart` script). It is safe to run as
 * often as you like:
 *
 *   1. apply whatever migrations the database is missing
 *   2. seed the departments and the run sheet, and — only while the portal has
 *      nobody in it — the bootstrap owner invite
 *   3. print the owner invite link while it is still unused, because the Render
 *      free plan has no Shell and the deploy log is the only way to read it
 *
 * No existing user, password or session is ever touched.
 *
 * Failures are reported and swallowed, so a TiDB hiccup at 07:00 on event day
 * cannot stop the service from booting. Pass --strict (the build does) to exit
 * non-zero instead.
 *
 *   npm run db:bootstrap
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "../src/lib/database-url";

const STRICT = process.argv.includes("--strict");
const databaseUrl = resolveDatabaseUrl();

function say(message: string): void {
  console.log(`[db-bootstrap] ${message}`);
}

function complain(message: string): void {
  console.error(`[db-bootstrap] ${message}`);
}

/** Prefer the copy npm installed; fall back to PATH. */
function binary(name: string): string {
  const local = join(process.cwd(), "node_modules", ".bin", name);
  return existsSync(local) ? local : name;
}

/** Runs a CLI with DATABASE_URL normalized for TiDB. See scripts/prisma.ts. */
function run(name: string, args: string[]): boolean {
  const result = spawnSync(binary(name), args, {
    stdio: "inherit",
    env: databaseUrl ? { ...process.env, DATABASE_URL: databaseUrl } : process.env,
  });

  if (result.error) {
    complain(`could not run ${name}: ${result.error.message}`);
    return false;
  }

  return result.status === 0;
}

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/** Migration folder names, in the order Prisma applies them. */
function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** The tables one migration creates, read out of the SQL itself. */
function tablesCreatedBy(migration: string): string[] {
  const sql = readFileSync(join(MIGRATIONS_DIR, migration, "migration.sql"), "utf8");
  return [...sql.matchAll(/CREATE TABLE\s+`([^`]+)`/gi)].map((m) => m[1].toLowerCase());
}

/** Every table the migrations create, read out of the SQL itself. */
function expectedTables(): string[] {
  const names = new Set<string>();
  for (const migration of migrationNames()) {
    for (const table of tablesCreatedBy(migration)) names.add(table);
  }
  return [...names];
}

/**
 * How much of the migration history a hand-built database already satisfies.
 *
 * A database whose schema was pasted into the TiDB SQL Editor has the right
 * tables and no history, and gets baselined. The subtlety is a database
 * baselined that way *before* a new migration was written: its tables match
 * every migration except the newest, and calling that "half-built" would refuse
 * to boot a perfectly healthy portal every time somebody adds a table.
 *
 * So the answer is a prefix, not a yes/no: the migrations whose tables are all
 * present get recorded as applied, and `migrate deploy` runs the rest — which
 * is exactly the state a clean deploy would be in.
 */
type Baseline =
  | { ok: true; applied: string[] }
  | { ok: false; migration: string; missing: string[] };

function baselinePrefix(tables: Set<string>): Baseline {
  const applied: string[] = [];
  // Migrations that only ALTER carry no evidence of their own; they ride along
  // with the next migration that does create a table.
  let undecided: string[] = [];

  for (const migration of migrationNames()) {
    const created = tablesCreatedBy(migration);

    if (created.length === 0) {
      undecided.push(migration);
      continue;
    }

    const present = created.filter((table) => tables.has(table));

    if (present.length === created.length) {
      applied.push(...undecided, migration);
      undecided = [];
      continue;
    }

    // Nothing from this migration exists: the database is baselined up to here
    // and `migrate deploy` applies this one and everything after it.
    if (present.length === 0) break;

    return {
      ok: false,
      migration,
      missing: created.filter((table) => !tables.has(table)),
    };
  }

  return { ok: true, applied };
}

/**
 * Reads the value out of a single-column row without trusting the driver to
 * have kept the alias. MySQL reports `TABLE_NAME`, the alias asks for `name`,
 * and a mismatch would turn every row into the string "undefined" — which
 * reads exactly like a database full of tables nobody recognizes.
 */
function firstValue(row: Record<string, unknown>): string | null {
  for (const value of Object.values(row)) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

async function tablesInDatabase(db: PrismaClient): Promise<Set<string>> {
  // The schema is taken from the connection string rather than DATABASE(),
  // which is empty unless the session happens to have one selected.
  const schema = databaseName();

  const rows = schema
    ? await db.$queryRaw<Record<string, unknown>[]>`
        SELECT TABLE_NAME AS name
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ${schema} AND TABLE_TYPE = 'BASE TABLE'
      `
    : await db.$queryRaw<Record<string, unknown>[]>`
        SELECT TABLE_NAME AS name
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      `;

  const names = new Set<string>();

  for (const row of rows) {
    const name = firstValue(row);
    if (name) names.add(name.toLowerCase());
  }

  return names;
}

/** The database the connection string points at, if it names one. */
function databaseName(): string | null {
  if (!databaseUrl) return null;

  try {
    const path = new URL(databaseUrl).pathname.replace(/^\//, "");
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

/**
 * Creates this portal's tables in a database that already holds unrelated ones.
 *
 * `migrate deploy` will not do it — P3005 refuses any database with tables it
 * has no history for, whether or not they collide — so the migration SQL is run
 * as a script and then recorded, which is the same end state a clean deploy
 * reaches. Only CREATE statements from our own migrations run, so nothing that
 * was already in there is touched.
 */
async function createSchemaAlongside(): Promise<boolean> {
  for (const migration of migrationNames()) {
    const file = join(MIGRATIONS_DIR, migration, "migration.sql");

    if (!run("prisma", ["db", "execute", "--schema", "prisma/schema.prisma", "--file", file])) {
      complain(`could not apply ${migration}.`);
      return false;
    }

    if (!run("prisma", ["migrate", "resolve", "--applied", migration])) {
      complain(`applied ${migration} but could not record it.`);
      return false;
    }
  }

  return true;
}

/**
 * Reconciles whatever is already in the database with what the migrations
 * expect, and recovers from P3005 — "the database schema is not empty".
 *
 * Prisma refuses to migrate a database holding tables it has no record of
 * creating, which is what you get whenever the schema was built by any route
 * other than `migrate deploy`: pasting `migration.sql` into the TiDB SQL Editor
 * produces exactly the right tables and no history at all.
 *
 * Four states, four answers:
 *
 *   nothing there            -> migrate normally
 *   every table already      -> record them as applied (Prisma's documented
 *                               baseline; no data is touched)
 *   some tables              -> stop. A half-built schema is a decision for a
 *                               person, and the message says what to run
 *   only unrelated tables    -> create ours beside them
 *
 * Every path says out loud what it found, because the one thing worse than a
 * refusal is a refusal that will not say why.
 */
async function reconcileSchema(db: PrismaClient): Promise<boolean> {
  const tables = await tablesInDatabase(db);

  // Prisma's own bookkeeping is not somebody else's schema. An empty one gets
  // left behind by any migrate run that bailed out, including the P3005 above.
  const hasHistoryTable = tables.delete("_prisma_migrations");

  if (hasHistoryTable) {
    const [row] = await db.$queryRaw<{ applied: bigint }[]>`
      SELECT COUNT(*) AS applied FROM _prisma_migrations
    `;
    if (Number(row?.applied ?? 0) > 0) return true; // Prisma is already in charge.
  }

  if (tables.size === 0) return true; // Nothing to reconcile; migrate normally.

  const expected = expectedTables();
  const present = expected.filter((table) => tables.has(table));
  const strangers = [...tables].filter((table) => !expected.includes(table)).sort();

  say(`database holds ${count(tables.size, "table")}, no migration history: ${[...tables].sort().join(", ")}`);

  const baseline = present.length > 0 ? baselinePrefix(tables) : null;

  // `applied` empty with tables of ours present means the tables that exist come
  // from the middle of the history, not the start of it — a hand-repaired
  // schema, and a person's decision rather than this script's.
  if (baseline?.ok && baseline.applied.length > 0) {
    const pending = migrationNames().length - baseline.applied.length;
    say(
      `${count(baseline.applied.length, "migration")} worth of tables are already there — ` +
        `recording them as applied (no data is touched)` +
        `${pending > 0 ? `; ${count(pending, "migration")} left for migrate deploy` : ""}…`,
    );

    for (const migration of baseline.applied) {
      if (!run("prisma", ["migrate", "resolve", "--applied", migration])) {
        complain(`could not record ${migration} as applied.`);
        return false;
      }
    }

    return true;
  }

  if (baseline) {
    const detail = baseline.ok
      ? `${present.length} of ${expected.length} tables exist, but not the earliest ones.`
      : `${baseline.migration} is partly applied.\n  Missing: ${baseline.missing.join(", ")}`;

    complain(
      `the schema is half-built — ${detail}\n\n` +
        "  Nobody has signed in yet if this is a new deployment, so the quickest\n" +
        "  repair is to recreate the database in the TiDB Cloud SQL Editor:\n\n" +
        `    DROP DATABASE \`${databaseName() ?? "hackathon_studio"}\`;\n` +
        `    CREATE DATABASE \`${databaseName() ?? "hackathon_studio"}\`;\n\n` +
        "  If it already holds real data, baseline it by hand instead:\n" +
        "  https://pris.ly/d/migrate-baseline",
    );
    return false;
  }

  say(
    `none of them are this portal's (${strangers.join(", ")}), so the schema is\n` +
      "  created alongside them rather than replacing anything.",
  );

  return createSchemaAlongside();
}

const BANNER = "  ────────────────────────────────────────────────────────";

function count(n: number, thing: string): string {
  return `${n} ${thing}${n === 1 ? "" : "s"}`;
}

async function main(): Promise<boolean> {
  if (!databaseUrl) {
    complain(
      "DATABASE_URL is not set, so there is no database to migrate.\n" +
        "  Set it in the Render dashboard to the TiDB Cloud connection string\n" +
        "  (Cluster → Connect → Connect With → Prisma) and redeploy.",
    );
    return false;
  }

  const db = new PrismaClient({ datasourceUrl: databaseUrl });

  try {
    if (!(await reconcileSchema(db))) return false;

    say("applying migrations…");
    if (!run("prisma", ["migrate", "deploy"])) {
      complain("migrations failed — the portal will not be able to read its tables.");
      return false;
    }

    const [users, departments] = await Promise.all([db.user.count(), db.department.count()]);

    let seeded = false;

    if (users === 0 || departments === 0) {
      say("portal looks empty — seeding departments and the run sheet…");
      if (!run("tsx", ["prisma/seed.ts"])) {
        complain("seeding failed.");
        return false;
      }
      seeded = true;
    }

    // Nobody has a password yet, so nobody can sign in yet. Surface the way in
    // rather than leaving somebody staring at an invite-only login page. The
    // seed has just said all this itself on the run that creates the invite,
    // so this is for every boot after that one.
    if (!seeded && (await db.user.count({ where: { passwordHash: { not: null } } })) === 0) {
      const invite = await db.invite.findFirst({
        where: {
          tier: "T4_OWNER",
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (invite) {
        console.log(
          `\n${BANNER}\n` +
            `  Nobody has signed in yet. Open this path on the portal to\n` +
            `  set the owner password:\n\n` +
            `    /invite/${invite.code}\n\n` +
            `  It works exactly once. This notice disappears from the log as\n` +
            `  soon as somebody has a password.\n` +
            `${BANNER}\n`,
        );
      } else if (!process.env.OWNER_EMAIL) {
        console.log(
          `\n${BANNER}\n` +
            `  The portal has no accounts and OWNER_EMAIL is not set, so there\n` +
            `  is no way in yet. Add OWNER_EMAIL (your school address) to the\n` +
            `  service's environment variables and redeploy — the invite link\n` +
            `  will be printed here.\n` +
            `${BANNER}\n`,
        );
      }
    }

    const [finalDepartments, finalUsers] = await Promise.all([
      db.department.count(),
      db.user.count(),
    ]);

    say(`ready — ${count(finalDepartments, "department")}, ${count(finalUsers, "account")}.`);
    return true;
  } finally {
    await db.$disconnect();
  }
}

main()
  .catch((error) => {
    complain(error instanceof Error ? error.message : String(error));
    return false;
  })
  .then((ok) => {
    if (ok) return;

    if (STRICT) {
      process.exitCode = 1;
      return;
    }

    say("starting anyway — pages that read the database will fail until this is fixed.");
  });
