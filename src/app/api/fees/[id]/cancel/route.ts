import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { cancelDemandSchema, type CancelDemandInput } from '@/lib/schemas/fees';
import { cancelDemand } from '@/server/services/fees';

export const dynamic = 'force-dynamic';

/**
 * Cancels a demand raised in error.
 *
 * A demand is never edited — the whole of §9 rests on that — so the only way
 * to correct one is to cancel it, with a reason that is audited, and raise
 * another. FEE_GENERATE is required: whoever may raise a demand may withdraw
 * one they should not have raised, and nobody else may.
 */
export const POST = defineRoute<CancelDemandInput>(
  async ({ user, params, body, ip, userAgent, correlationId }) =>
    cancelDemand(user, params.id!, body.reason, { ip, userAgent, correlationId }),
  {
    capabilities: [CAPABILITIES.FEE_GENERATE],
    schema: cancelDemandSchema,
  }
);
