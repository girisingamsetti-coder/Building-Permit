import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { resetUserPassword } from '@/server/services/users';

export const dynamic = 'force-dynamic';

/**
 * Issues a temporary password the user must change at next sign-in, and
 * revokes their sessions. The password is returned once and never stored in
 * readable form.
 */
export const POST = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) =>
    resetUserPassword(params.id!, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.USER_MANAGE] }
);
