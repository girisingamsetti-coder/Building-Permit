import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { unlockUser } from '@/server/services/users';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) =>
    unlockUser(params.id!, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.USER_MANAGE] }
);
