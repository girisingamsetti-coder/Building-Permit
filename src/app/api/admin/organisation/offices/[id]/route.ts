import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { updateOffice, deleteOffice } from '@/server/services/organisation-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(2).max(100).optional(),
  departmentId: z.string().nullable().optional(),
  zoneId: z.string().nullable().optional(),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
});
export const PATCH = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) => updateOffice(params.id, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.ORG_MANAGE], schema }
);
export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) => deleteOffice(params.id, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.ORG_MANAGE] }
);
