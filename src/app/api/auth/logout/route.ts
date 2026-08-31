import { defineRoute } from '@/server/http/route';
import { signOut } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

/**
 * Sign out. Revokes the session row, so any access token minted from it stops
 * working immediately rather than when it happens to expire.
 *
 * `auth: false` because signing out must succeed even when the session has
 * already expired — otherwise the cookies are never cleared.
 */
export const POST = defineRoute(
  async ({ ip, userAgent, correlationId }) => {
    await signOut({ ip, userAgent, correlationId });
    return { ok: true };
  },
  { auth: false }
);
