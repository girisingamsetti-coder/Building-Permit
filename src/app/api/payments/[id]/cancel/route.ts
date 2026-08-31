import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { cancelPayment } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/**
 * The payer giving up on an attempt.
 *
 * Does not take the click at face value: the service asks the gateway first,
 * because a payer can press Cancel on our page having already paid at the
 * gateway, and marking that attempt cancelled would lose the money. If the
 * gateway says it was paid, this call produces a receipt rather than a
 * cancellation — which is the correct outcome, however odd it looks.
 */
export const POST = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) =>
    cancelPayment(user, params.id!, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.PAYMENT_INITIATE] }
);
