import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { addStage } from '@/server/services/workflow-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  workflowId: z.string(),
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(100),
  type: z.string().default('REVIEW'),
  sequence: z.number().int().min(1),
  ownerRoleKeys: z.array(z.string()).min(1),
  entryStatus: z.string(),
  workingStatus: z.string().nullable().optional(),
  slaDays: z.number().int().min(0).default(0),
  isEntry: z.boolean().default(false),
  isTerminal: z.boolean().default(false),
  allowReassign: z.boolean().default(true),
  description: z.string().default(''),
});
export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) =>
    addStage(body.workflowId, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_MANAGE], schema }
);
