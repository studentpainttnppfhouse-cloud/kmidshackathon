/**
 * Runs the Prisma CLI with DATABASE_URL normalized for TiDB Cloud.
 *
 * `prisma migrate deploy` reads the environment directly, so the fix that lives
 * in src/lib/database-url.ts has to be applied here too — otherwise a build on
 * Render fails with "Connections using insecure transport are prohibited" even
 * though the running app connects fine.
 *
 *   npm run db:deploy      ->  tsx scripts/prisma.ts migrate deploy
 */
import { spawnSync } from "node:child_process";
import { resolveDatabaseUrl } from "../src/lib/database-url";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("usage: tsx scripts/prisma.ts <prisma arguments>");
  process.exit(1);
}

const databaseUrl = resolveDatabaseUrl();

const result = spawnSync("prisma", args, {
  stdio: "inherit",
  env: databaseUrl ? { ...process.env, DATABASE_URL: databaseUrl } : process.env,
});

if (result.error) {
  console.error(`Could not run the Prisma CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
