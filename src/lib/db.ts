import { PrismaClient } from "@prisma/client";

// Next.js dev mode re-evaluates modules on every hot reload; without this the
// connection pool grows until TiDB starts refusing connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
