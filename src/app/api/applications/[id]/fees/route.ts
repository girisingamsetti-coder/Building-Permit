import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getFees } from '@/server/services/fees';

export const dynamic = 'force-dynamic';

/**
 * The demands raised against one application, with their frozen breakdowns.
 *
 * FEE_VIEW, not APPLICATION_VIEW: what somebody owes is not the same class of
 * information as what they applied for, and the matrix grants the two
 * separately. An LTP sees their own; Finance sees every one; the read-only
 * Viewer sees them and can write nothing.
 */
export const GET = defineRoute(async ({ user, params }) => getFees(user, params.id!), {
  capabilities: [CAPABILITIES.FEE_VIEW],
});
