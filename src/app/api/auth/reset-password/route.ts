import { defineRoute } from '@/server/http/route';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/schemas/auth';
import { resetPassword } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

/**
 * Complete a reset. Single-use token, 30-minute TTL. On success every other
 * session is revoked — if the reset was prompted by a compromise, the
 * attacker's session must not survive it.
 */
export const POST = defineRoute<ResetPasswordInput>(
  async ({ body, ip, userAgent, correlationId }) => {
    await resetPassword(body.token, body.password, { ip, userAgent, correlationId });
    return { ok: true, message: 'Your password has been changed. You can now sign in.' };
  },
  { auth: false, schema: resetPasswordSchema, rateLimit: 'forgotPassword' }
);
