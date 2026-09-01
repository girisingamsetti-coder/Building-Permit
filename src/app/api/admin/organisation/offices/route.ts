import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listOffices, createOffice } from '@/server/services/organisation-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(2).max(100),
  departmentId: z.string().nullable().optional(),
  zoneId: z.string().nullable().optional(),
  address: z.string().optional(),
});
export const GET = defineRoute(() => listOffices(), { capabilities: [CAPABILITIES.ORG_MANAGE] });
export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) => createOffice(body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.ORG_MANAGE], schema }
);
