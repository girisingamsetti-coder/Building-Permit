import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { setUserStatusSchema, type SetUserStatusInput } from '@/lib/schemas/users';
import { setUserStatus } from '@/server/services/users';

export const dynamic = 'force-dynamic';

/**
 * Activate or deactivate. Deactivating also revokes every live session — an
 * account that is "inactive" but still browsing is not deactivated.
 */
export const POST = defineRoute<SetUserStatusInput>(
  async ({ params, body, user, ip, userAgent, correlationId }) =>
    setUserStatus(params.id!, body.status, body.reason, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.USER_MANAGE], schema: setUserStatusSchema }
);
