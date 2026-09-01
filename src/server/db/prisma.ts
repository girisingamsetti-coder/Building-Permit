import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '@/server/config/env';

/**
 * Resolves SQLite database location.
 * On Vercel / serverless production, the deployment root is read-only.
 * We copy the pre-seeded demo database to /tmp/lams.db on cold start so writes succeed.
 */
function resolveDatabaseUrl(): string {
  const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isVercel) {
    const tmpPath = path.join('/tmp', 'lams.db');
    if (!fs.existsSync(tmpPath)) {
      const candidates = [
        path.join(process.cwd(), 'prisma', 'demo.db'),
        path.join(process.cwd(), 'prisma', 'dev.db'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try {
            fs.copyFileSync(candidate, tmpPath);
            break;
          } catch (e) {
            console.error('Failed to copy demo database to /tmp:', e);
          }
        }
      }
    }
    return `file:${tmpPath}`;
  }

  // Local development: ensure absolute or relative path works seamlessly
  const rawUrl = env.databaseUrl || 'file:./dev.db';
  if (rawUrl.startsWith('file:./') || rawUrl.startsWith('file:.\\')) {
    const relativePath = rawUrl.slice(7);
    const resolvedPath = path.resolve(process.cwd(), 'prisma', relativePath);
    return `file:${resolvedPath}`;
  }
  return rawUrl;
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
