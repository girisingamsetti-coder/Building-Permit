import 'server-only';
import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '@/server/config/env';

/**
 * Resolves PostgreSQL database location from environment.
 */
function resolveDatabaseUrl(): string {
  if (!env.databaseUrl && !process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set in the environment variables!');
  }
  return env.databaseUrl || process.env.DATABASE_URL || '';
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const dbUrl = resolveDatabaseUrl();
  return new PrismaClient({
    datasourceUrl: dbUrl,
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
 */
export type Tx = Prisma.TransactionClient;

/** Either a transaction client or the base client. */
export type Db = Tx | PrismaClient;

export { Prisma };
export * from '@/types/enums';
