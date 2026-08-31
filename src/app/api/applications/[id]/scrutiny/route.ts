import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getScrutiny, requestScrutiny } from '@/server/services/scrutiny';

export const dynamic = 'force-dynamic';

/**
 * Scrutiny for one application.
 *
 * GET is polled by the Scrutiny tab while a run is in flight, so it is cheap
 * and returns the whole picture — current runs, full history and totals — in
 * one request rather than making the client stitch three together.
 */

export const GET = defineRoute(async ({ user, params }) => getScrutiny(user, params.id!), {
  capabilities: [CAPABILITIES.SCRUTINY_VIEW],
});

/**
 * Sends the current drawing set to the engine.
 *
 * Takes no body: what gets checked is whatever is ACTIVE on the application,
 * decided server-side. Accepting a list of version ids would let a caller
 * choose which of their drawings to have judged.
 */
export const POST = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) =>
    requestScrutiny(user, params.id!, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.SCRUTINY_REQUEST] }
);
