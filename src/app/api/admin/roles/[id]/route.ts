import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { updateRole, deleteRole } from '@/server/services/role-admin';

export const dynamic = 'force-dynamic';

const updateRoleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().optional(),
});

export const PATCH = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) =>
    updateRole(params.id, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.ROLE_MANAGE], schema: updateRoleSchema }
);

export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) =>
    deleteRole(params.id, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.ROLE_MANAGE] }
);
