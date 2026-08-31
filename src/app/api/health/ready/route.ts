import { NextResponse } from 'next/server';
import { defineRoute } from '@/server/http/route';
import { prisma } from '@/server/db/prisma';
import { env } from '@/server/config/env';

export const dynamic = 'force-dynamic';

/**
 * Readiness. Answers "can this process actually serve traffic" — which means
 * checking the dependencies a request will need.
 *
 * Returns 503 when any required check fails, so a load balancer takes the
 * instance out of rotation rather than sending it work it cannot do.
 */

type Check = { name: string; ok: boolean; detail: string; required: boolean; ms: number };

export const GET = defineRoute(
  async () => {
    const checks: Check[] = [];

    checks.push(await timed('database', true, async () => {
      await prisma.$queryRaw`SELECT 1`;
      return 'connected';
    }));

    checks.push(await timed('migrations', true, async () => {
      const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `;
      const count = Number(rows[0]?.count ?? 0);
      if (count === 0) throw new Error('no tables — run `npm run db:migrate`');
      return `${count} tables`;
    }));

    checks.push(await timed('job queue', false, async () => {
      const [pending, dead] = await Promise.all([
        prisma.job.count({ where: { status: 'PENDING' } }),
        prisma.job.count({ where: { status: 'DEAD' } }),
      ]);
      if (dead > 0) throw new Error(`${dead} dead job(s) need attention`);
      return `${pending} pending`;
    }));

    checks.push(await timed('outbox', false, async () => {
      const backlog = await prisma.outboxEvent.count({ where: { processed: false } });
      if (backlog > 1000) throw new Error(`backlog of ${backlog} — is the worker running?`);
      return `${backlog} unprocessed`;
    }));

    const requiredFailed = checks.some((c) => c.required && !c.ok);
    const anyFailed = checks.some((c) => !c.ok);

    const body = {
      status: requiredFailed ? 'unhealthy' : anyFailed ? 'degraded' : 'ok',
      environment: env.nodeEnv,
      demoMode: env.demoMode,
      drivers: {
        storage: env.storageProvider,
        scrutiny: env.scrutinyProvider,
        payment: env.paymentProvider,
        sms: env.smsProvider,
        mail: env.emailProvider,
        antivirus: env.antivirusProvider,
      },
      checks,
      time: new Date().toISOString(),
    };

    return NextResponse.json(body, { status: requiredFailed ? 503 : 200 });
  },
  { auth: false }
);

async function timed(
  name: string,
  required: boolean,
  fn: () => Promise<string>
): Promise<Check> {
  const started = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, required, ms: Date.now() - started };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      required,
      ms: Date.now() - started,
    };
  }
}
