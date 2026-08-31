import { defineRoute } from '@/server/http/route';
import { changePasswordSchema, type ChangePasswordInput } from '@/lib/schemas/auth';
import { changePassword } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

/**
 * Change your own password. Requires the current one, so a hijacked session
 * alone is not enough to lock the real owner out.
 */
export const POST = defineRoute<ChangePasswordInput>(
  async ({ body, user, ip, userAgent, correlationId }) => {
    await changePassword(user.id, body.currentPassword, body.password, {
      ip,
      userAgent,
      correlationId,
      sessionId: user.sessionId,
    });
    return { ok: true, message: 'Your password has been changed.' };
  },
  { schema: changePasswordSchema }
);
