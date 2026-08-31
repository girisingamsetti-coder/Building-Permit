import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getShortfalls } from '@/server/workflow/engine';

export const dynamic = 'force-dynamic';

/**
 * Everything asked of the applicant on this file, open and closed.
 *
 * SHORTFALL_VIEW, which the LTP holds for their own files and every officer
 * holds for the ones in their scope — a shortfall raised at TPA is exactly the
 * thing the Commissioner needs to see six desks later, because it is what will
 * block the approval.
 */
export const GET = defineRoute(async ({ user, params }) => getShortfalls(user, params.id!), {
  capabilities: [CAPABILITIES.SHORTFALL_VIEW],
});
