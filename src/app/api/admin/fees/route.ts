import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listFeeStructures, createFeeStructure } from '@/server/services/fee-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(100),
  applicationTypeId: z.string().nullable().optional(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
  roundingRule: z.string().default('NEAREST_1'),
  notes: z.string().default(''),
});
export const GET = defineRoute(() => listFeeStructures(), { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE] });
export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) => createFeeStructure(body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.FEE_STRUCTURE_MANAGE], schema }
);
