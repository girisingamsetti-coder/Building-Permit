import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getPayments } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/**
 * The demands, the attempts and the receipts for one application.
 *
 * PAYMENT_VIEW, not APPLICATION_VIEW: what somebody has paid is not the same
 * class of information as what they applied for, and the matrix grants the two
 * separately. An LTP sees their own; Finance sees every one; the read-only
 * Viewer sees them and can write nothing.
 */
export const GET = defineRoute(async ({ user, params }) => getPayments(user, params.id!), {
  capabilities: [CAPABILITIES.PAYMENT_VIEW],
});
