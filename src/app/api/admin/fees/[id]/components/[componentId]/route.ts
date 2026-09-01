import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { updateFeeComponent, removeFeeComponent } from '@/server/services/fee-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  basis: z.string().optional(),
  rate: z.number().nullable().optional(),
  variable: z.string().optional(),
  percentOfCode: z.string().optional(),
  expression: z.string().optional(),
  headOfAccount: z.string().optional(),
  minAmount: z.number().nullable().optional(),
  maxAmount: z.number().nullable().optional(),
  isRefundable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export const PATCH = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) => updateFeeComponent(params.componentId, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE], schema }
);
export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) => removeFeeComponent(params.componentId, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE] }
);
