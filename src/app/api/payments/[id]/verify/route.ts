import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { verifyPayment } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/**
 * "Did it work?" — asked by the return page.
 *
 * There is no body, and there could not usefully be one. Whatever the gateway
 * appended to the return URL travelled through the payer's browser, so it is
 * evidence of nothing; the service asks the gateway directly and settles on
 * that answer alone (§5.1, §5.2).
 *
 * Safe to call repeatedly. A payment that is already settled returns its
 * settled state without touching money, which is what lets the return page
 * poll while a slow gateway finishes.
 *
 * ── Who may ask ────────────────────────────────────────────────────────
 *
 * PAYMENT_INITIATE or PAYMENT_RECONCILE. The payer, because this is what
 * their return page calls; and finance, because "did this actually go
 * through?" is their question to answer with an applicant on the telephone.
 *
 * NOT plain PAYMENT_VIEW, which a zonal officer and the read-only Viewer both
 * hold. Verification cannot invent a payment — it only confirms what the
 * gateway already did — but it can settle one, and settling credits a demand
 * and can move an application to the department. That is not a side effect to
 * hand to everyone who may look at a payment.
 *
 * docs/05-api.md lists this as PAYMENT_INITIATE alone, which would have shut
 * finance out of the endpoint they need most.
 */
export const POST = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) =>
    verifyPayment(user, params.id!, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.PAYMENT_INITIATE, CAPABILITIES.PAYMENT_RECONCILE] }
);
