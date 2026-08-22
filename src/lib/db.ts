import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "@/lib/database-url";

// Next.js dev mode re-evaluates modules on every hot reload; without this the
// connection pool grows until TiDB starts refusing connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Passed explicitly instead of leaning on env("DATABASE_URL") in the schema, so
// a TiDB Cloud string pasted without ?sslaccept=strict still connects over TLS.
const datasourceUrl = resolveDatabaseUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
