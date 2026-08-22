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
import { existsSync } from "node:fs";
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

  say("applying migrations…");
  if (!run("prisma", ["migrate", "deploy"])) {
    complain("migrations failed — the portal will not be able to read its tables.");
    return false;
  }

  const db = new PrismaClient({ datasourceUrl: databaseUrl });

  try {
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
