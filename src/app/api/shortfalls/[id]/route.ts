import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getShortfall } from '@/server/shortfalls/queries';

export const dynamic = 'force-dynamic';

/** One shortfall: what was asked, what is owed, and every attempt to answer. */
export const GET = defineRoute(async ({ user, params }) => getShortfall(user, params.id!), {
  capabilities: [CAPABILITIES.SHORTFALL_VIEW],
});
