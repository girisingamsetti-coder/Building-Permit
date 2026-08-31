import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { withdrawShortfallSchema, type WithdrawShortfallInput } from '@/lib/schemas/shortfalls';
import { withdrawShortfall } from '@/server/shortfalls/actions';

export const dynamic = 'force-dynamic';

/**
 * Withdraws a shortfall raised in error.
 *
 * The only way out of one that should not have been raised — a shortfall is
 * never deleted, and withdrawing says so on the record. Restricted to the
 * officer who raised it or a supervisor.
 */
export const POST = defineRoute<WithdrawShortfallInput>(
  async ({ user, params, body, ip, userAgent, correlationId }) =>
    withdrawShortfall(user, params.id!, body, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.SHORTFALL_CREATE], schema: withdrawShortfallSchema }
);
