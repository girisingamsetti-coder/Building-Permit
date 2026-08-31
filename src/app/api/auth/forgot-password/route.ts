import { defineRoute } from '@/server/http/route';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/schemas/auth';
import { requestPasswordReset } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

/**
 * Request a reset link.
 *
 * Always returns the same response whether or not the address exists. The
 * response must not be an account-existence oracle, so there is deliberately
 * no "no such user" path here.
 */
export const POST = defineRoute<ForgotPasswordInput>(
  async ({ body, ip, userAgent, correlationId }) => {
    await requestPasswordReset(body.email, { ip, userAgent, correlationId });
    return {
      ok: true,
      message: 'If that address has an account, a reset link is on its way.',
    };
  },
  {
    auth: false,
    schema: forgotPasswordSchema,
    rateLimit: 'forgotPassword',
    rateLimitKey: ({ body }) => body.email,
  }
);
