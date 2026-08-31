import { defineRoute, created } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { generateFee } from '@/server/services/fees';

export const dynamic = 'force-dynamic';

/**
 * Issues the demand.
 *
 * The completion gate lives in the service, not here — it must hold for every
 * caller, including a future workflow effect that raises a demand
 * automatically when the last document is verified. A guard written into a
 * route is a guard that the next entry point does not have.
 *
 * Note the body: there isn't one. Nothing a client sends can influence an
 * amount. The server resolves the effective structure, builds the context from
 * the application's own particulars, and calculates.
 */
export const POST = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) =>
    created(await generateFee(user, params.id!, { ip, userAgent, correlationId })),
  { capabilities: [CAPABILITIES.FEE_GENERATE] }
);
