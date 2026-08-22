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

/** Every table the migrations create, read out of the SQL itself. */
function expectedTables(): string[] {
  const names = new Set<string>();

  for (const migration of migrationNames()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, migration, "migration.sql"), "utf8");
    for (const match of sql.matchAll(/CREATE TABLE\s+`([^`]+)`/gi)) {
      names.add(match[1].toLowerCase());
    }
  }

  return [...names];
}

async function tablesInDatabase(db: PrismaClient): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ name: string }[]>`
    SELECT TABLE_NAME AS name
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
  `;

  return new Set(rows.map((row) => String(row.name).toLowerCase()));
}

/**
 * Recovers from P3005 — "the database schema is not empty".
 *
 * Prisma refuses to apply migrations to a database that already has tables it
 * has no record of creating, which is what you get if the schema was built by
 * hand: pasting `migration.sql` into the TiDB SQL Editor produces exactly the
 * right tables and no `_prisma_migrations` history at all.
 *
 * When every table the migrations would create is already there, the honest
 * repair is to record them as applied rather than to drop anybody's data, and
 * that is Prisma's own documented baseline procedure. Anything less than a
 * complete match is left alone — a half-built schema is a decision for a human,
 * not something to paper over.
 */
async function baselineIfNeeded(db: PrismaClient): Promise<boolean> {
  const tables = await tablesInDatabase(db);
  if (tables.size === 0) return true; // Fresh database; nothing to reconcile.

  if (tables.has("_prisma_migrations")) {
    const [{ applied }] = await db.$queryRaw<{ applied: bigint }[]>`
      SELECT COUNT(*) AS applied FROM _prisma_migrations
    `;
    if (Number(applied) > 0) return true; // Prisma is already in charge here.
  }

  const expected = expectedTables();
  const present = expected.filter((table) => tables.has(table));

  if (present.length === 0) {
    complain(
      "the database already contains tables that are not this portal's, and\n" +
        "  Prisma has no migration history for them. Point DATABASE_URL at a\n" +
        "  database of its own rather than sharing this one.",
    );
    return false;
  }

  if (present.length < expected.length) {
    const missing = expected.filter((table) => !tables.has(table));
    complain(
      `the schema is half-built — ${present.length} of ${expected.length} tables exist ` +
        `(missing: ${missing.join(", ")}).\n` +
        "  Nobody has signed in yet if this is a new deployment, so the quickest\n" +
        "  repair is to recreate the database in the TiDB Cloud SQL Editor:\n\n" +
        "    DROP DATABASE hackathon_studio;\n" +
        "    CREATE DATABASE hackathon_studio;\n\n" +
        "  If it already holds real data, baseline it by hand instead:\n" +
        "  https://pris.ly/d/migrate-baseline",
    );
    return false;
  }

  say("tables exist but Prisma has no record of them — baselining (no data is touched)…");

  for (const migration of migrationNames()) {
    if (!run("prisma", ["migrate", "resolve", "--applied", migration])) {
      complain(`could not record ${migration} as applied.`);
      return false;
    }
  }

  return true;
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
    if (!(await baselineIfNeeded(db))) return false;

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
