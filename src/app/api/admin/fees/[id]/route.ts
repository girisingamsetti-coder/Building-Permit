import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getFeeStructure, updateFeeStructure } from '@/server/services/fee-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  effectiveTo: z.string().nullable().optional(),
  roundingRule: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});
export const GET = defineRoute(
  async ({ params }) => getFeeStructure(params.id),
  { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE] }
);
export const PATCH = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) => updateFeeStructure(params.id, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE], schema }
);
