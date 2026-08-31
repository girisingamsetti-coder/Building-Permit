import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { releaseTask } from '@/server/workflow/tasks';

export const dynamic = 'force-dynamic';

/** Put a claimed file back on the shared queue. */
export const POST = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) =>
    releaseTask(user, params.id!, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_CLAIM_TASK] }
);
