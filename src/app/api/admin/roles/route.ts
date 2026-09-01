import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listRoles, createRole, listPermissions } from '@/server/services/role-admin';

export const dynamic = 'force-dynamic';

const createRoleSchema = z.object({
  key: z.string().min(2).max(50),
  name: z.string().min(2).max(100),
  description: z.string().default(''),
  permissionKeys: z.array(z.string()).default([]),
});

export const GET = defineRoute(
  async () => ({ roles: await listRoles(), permissions: await listPermissions() }),
  { capabilities: [CAPABILITIES.ROLE_MANAGE] }
);

export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) =>
    createRole(body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.ROLE_MANAGE], schema: createRoleSchema }
);
