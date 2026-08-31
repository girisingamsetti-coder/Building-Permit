import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { takeUpShortfall } from '@/server/shortfalls/actions';

export const dynamic = 'force-dynamic';

/** "I am looking at this" — moves an answered shortfall to UNDER_REVIEW. */
export const POST = defineRoute(async ({ user, params }) => takeUpShortfall(user, params.id!), {
  capabilities: [CAPABILITIES.SHORTFALL_RESOLVE],
});
