import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { addTransition } from '@/server/services/workflow-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  workflowId: z.string(),
  fromStageId: z.string(),
  actionId: z.string(),
  fromStatus: z.string().nullable().optional(),
  toStageId: z.string().nullable().optional(),
  toStatus: z.string(),
  allowedRoleKeys: z.array(z.string()).default([]),
  guards: z.array(z.string()).default([]),
  effects: z.array(z.unknown()).default([]),
  notifyEvent: z.string().default(''),
  slaBehavior: z.string().default('NONE'),
  priority: z.number().int().default(0),
});
export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) =>
    addTransition(body.workflowId, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_MANAGE], schema }
);
