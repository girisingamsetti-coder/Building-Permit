import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { publishDraft, discardDraft } from '@/server/services/workflow-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({ draftId: z.string() });
export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) =>
    publishDraft(body.draftId, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_MANAGE], schema }
);
export const DELETE = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) =>
    discardDraft(body.draftId, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_MANAGE], schema }
);
