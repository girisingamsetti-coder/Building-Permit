import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { claimTask } from '@/server/workflow/tasks';

export const dynamic = 'force-dynamic';

/**
 * Take a file off the shared queue.
 *
 * A conditional update decided by the database, so two officers pressing this
 * in the same second produce one winner and one clear refusal naming who got
 * there first.
 */
export const POST = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) =>
    claimTask(user, params.id!, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_CLAIM_TASK] }
);
