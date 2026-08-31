import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getHistory } from '@/server/workflow/engine';

export const dynamic = 'force-dynamic';

/** Every movement of one file, oldest first. Append-only in the database. */
export const GET = defineRoute(async ({ user, params }) => getHistory(user, params.id!), {
  capabilities: [CAPABILITIES.WORKFLOW_VIEW],
});
