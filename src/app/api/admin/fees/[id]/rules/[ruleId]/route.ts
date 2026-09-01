import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { updateFeeRule, removeFeeRule } from '@/server/services/fee-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  kind: z.string().optional(),
  basis: z.string().optional(),
  rate: z.number().nullable().optional(),
  appliesToCode: z.string().optional(),
  minAmount: z.number().nullable().optional(),
  maxAmount: z.number().nullable().optional(),
  condition: z.unknown().optional(),
  reason: z.string().optional(),
  isActive: z.boolean().optional(),
});
export const PATCH = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) => updateFeeRule(params.ruleId, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE], schema }
);
export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) => removeFeeRule(params.ruleId, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE] }
);
