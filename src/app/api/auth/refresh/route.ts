import { defineRoute } from '@/server/http/route';
import { refreshSession } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

/**
 * Slide the idle window and rotate the refresh token.
 *
 * Rotation is the point: a stolen refresh token works exactly once, and the
 * legitimate holder's next refresh then fails — which surfaces the theft
 * rather than hiding it.
 */
export const POST = defineRoute(
  async ({ ip, userAgent, correlationId }) => refreshSession({ ip, userAgent, correlationId }),
  { auth: false }
);
