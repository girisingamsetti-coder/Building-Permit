import { defineRoute } from '@/server/http/route';
import { env } from '@/server/config/env';

export const dynamic = 'force-dynamic';

/**
 * Liveness. Answers "is this process running", nothing more — it must not
 * touch the database, or a database blip would cause an orchestrator to kill
 * healthy application processes.
 */
export const GET = defineRoute(
  async () => ({
    status: 'ok',
    service: 'lams-web',
    environment: env.nodeEnv,
    time: new Date().toISOString(),
  }),
  { auth: false }
);
