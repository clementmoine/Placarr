import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPgPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Cap per-process pool so Vitest workers / Next + worker don't exhaust
  // Postgres max_connections (100). Override with PRISMA_PG_POOL_MAX.
  const max = Number(process.env.PRISMA_PG_POOL_MAX ?? 10);

  return new Pool({
    connectionString,
    max: Number.isFinite(max) && max > 0 ? max : 10,
    // Match Prisma 6 engine default (~5s) — pg defaults to 0 (wait forever).
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
}

function createPrismaClient(): PrismaClient {
  const pool = globalForPrisma.pgPool ?? createPgPool();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Disconnect Prisma and drain the underlying `pg` pool (adapter does not). */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect().catch(() => {});
  const pool = globalForPrisma.pgPool;
  if (pool) {
    await pool.end().catch(() => {});
    globalForPrisma.pgPool = undefined;
  }
  globalForPrisma.prisma = undefined;
}
