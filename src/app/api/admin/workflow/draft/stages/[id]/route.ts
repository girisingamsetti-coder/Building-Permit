import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { updateStage, removeStage } from '@/server/services/workflow-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  type: z.string().optional(),
  sequence: z.number().int().min(1).optional(),
  ownerRoleKeys: z.array(z.string()).optional(),
  entryStatus: z.string().optional(),
  workingStatus: z.string().nullable().optional(),
  slaDays: z.number().int().min(0).optional(),
  isEntry: z.boolean().optional(),
  isTerminal: z.boolean().optional(),
  allowReassign: z.boolean().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});
export const PATCH = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) => updateStage(params.id, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_MANAGE], schema }
);
export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) => removeStage(params.id, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_MANAGE] }
);
