import 'server-only';
import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '@/server/config/env';

/**
 * One Prisma client per process.
 *
 * Next.js dev reloads modules on every edit; without the global cache each
 * reload would open a fresh connection pool until Postgres refuses new
 * connections.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  return new PrismaClient({
    log:
      env.logLevel === 'debug'
        ? [{ emit: 'stdout', level: 'query' }, 'info', 'warn', 'error']
        : ['warn', 'error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (!env.isProduction) globalForPrisma.prisma = prisma;

/**
 * The transaction client type.
 *
 * Services that must write inside a caller's transaction — `audit()`,
 * `emit()` — take this rather than importing `prisma` directly, so the audit
 * row and the change it describes commit together or not at all.
 */
export type Tx = Prisma.TransactionClient;

/** Either a transaction client or the base client. */
export type Db = Tx | PrismaClient;

export { Prisma };
