import { defineRoute, created } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { initiatePaymentSchema, type InitiatePaymentInput } from '@/lib/schemas/payments';
import { initiatePayment } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/**
 * Starts a payment against a demand.
 *
 * The body names a demand. It cannot name an amount, a gateway, a status or a
 * return URL — the server resolves all four, from the demand's own balance,
 * the configured driver and its own APP_URL. A request that could name any of
 * them is a request that could pay a rupee against a lakh-rupee demand.
 *
 * Rate-limited: initiating a payment opens a session at a third party, and an
 * endpoint that opens unlimited ones is both a cost and a way to make a
 * merchant account look compromised.
 */
export const POST = defineRoute<InitiatePaymentInput>(
  async ({ user, body, ip, userAgent, correlationId }) =>
    created(await initiatePayment(user, body.applicationFeeId, { ip, userAgent, correlationId })),
  {
    capabilities: [CAPABILITIES.PAYMENT_INITIATE],
    schema: initiatePaymentSchema,
    rateLimit: 'paymentInitiate',
  }
);
