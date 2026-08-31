import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { reconcileNow } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/**
 * Finance running the reconciliation sweep by hand.
 *
 * The same sweep the worker runs every five minutes, and deliberately the same
 * function rather than a "manual" variant: a reconciliation that behaves
 * differently when a person triggers it is a reconciliation whose results
 * cannot be compared. What differs is only the audit row, which names who ran
 * it.
 *
 * It exists because a finance officer with an applicant on the telephone
 * should not have to wait for a cron tick.
 */
export const POST = defineRoute(
  async ({ user, ip, userAgent, correlationId }) =>
    reconcileNow(user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.PAYMENT_RECONCILE] }
);
