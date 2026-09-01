import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { addFeeRule } from '@/server/services/fee-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(100),
  kind: z.enum(['DISCOUNT', 'SURCHARGE', 'REBATE']),
  basis: z.enum(['FLAT', 'PERCENTAGE']),
  rate: z.number().nullable().optional(),
  appliesToCode: z.string().default(''),
  minAmount: z.number().nullable().optional(),
  maxAmount: z.number().nullable().optional(),
  condition: z.unknown().optional(),
  reason: z.string().default(''),
});
export const POST = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) => addFeeRule(params.id, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE], schema }
);
