import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { reviewShortfallSchema, type ReviewShortfallInput } from '@/lib/schemas/shortfalls';
import { reviewShortfall } from '@/server/shortfalls/actions';

export const dynamic = 'force-dynamic';

/**
 * The officer's verdict on a response.
 *
 * A FEE shortfall cannot be accepted until its demand is actually paid — the
 * engine reads the ledger, not the applicant's word and not the officer's.
 */
export const POST = defineRoute<ReviewShortfallInput>(
  async ({ user, params, body, ip, userAgent, correlationId }) =>
    reviewShortfall(user, params.id!, body, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.SHORTFALL_RESOLVE], schema: reviewShortfallSchema }
);
