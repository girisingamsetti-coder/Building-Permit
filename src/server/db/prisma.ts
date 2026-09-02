import 'server-only';
import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '@/server/config/env';

/**
 * Resolves PostgreSQL database location from environment.
 */
function resolveDatabaseUrl(): string {
  return (
    env.databaseUrl ||
    process.env.DATABASE_URL ||
    'postgresql://postgres.bunfbgaxbueririehybw:Digitaltwin%405678@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10&pool_timeout=20'
  );
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
