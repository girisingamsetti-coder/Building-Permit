import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { removeTransition } from '@/server/services/workflow-admin';

export const dynamic = 'force-dynamic';
export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) => removeTransition(params.id, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_MANAGE] }
);
