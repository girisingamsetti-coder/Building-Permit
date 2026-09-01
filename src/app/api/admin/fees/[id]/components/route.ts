import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { addFeeComponent } from '@/server/services/fee-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(100),
  basis: z.string(),
  rate: z.number().nullable().optional(),
  variable: z.string().optional(),
  percentOfCode: z.string().optional(),
  expression: z.string().optional(),
  headOfAccount: z.string().optional(),
  minAmount: z.number().nullable().optional(),
  maxAmount: z.number().nullable().optional(),
  isRefundable: z.boolean().default(false),
});
export const POST = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) => addFeeComponent(params.id, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE], schema }
);
