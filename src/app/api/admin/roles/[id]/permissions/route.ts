import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { setRolePermissions } from '@/server/services/role-admin';

export const dynamic = 'force-dynamic';

const schema = z.object({
  permissionKeys: z.array(z.string()),
});

export const POST = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) =>
    setRolePermissions(params.id, body.permissionKeys, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.ROLE_MANAGE], schema }
);
