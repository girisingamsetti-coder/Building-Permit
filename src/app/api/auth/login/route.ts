import { defineRoute } from '@/server/http/route';
import { loginSchema, type LoginInput } from '@/lib/schemas/auth';
import { signIn } from '@/server/services/auth';
import { dashboardFor } from '@/lib/rbac-matrix';
import type { RoleKey } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * Sign in.
 *
 * Rate limited to 5 attempts per 15 minutes per caller, on top of the
 * per-account lockout in the service. The two are different controls: the
 * limiter slows a spray across many accounts, the lockout stops a grind
 * against one.
 */
export const POST = defineRoute<LoginInput>(
  async ({ body, ip, userAgent, correlationId }) => {
    const user = await signIn(body.email, body.password, { ip, userAgent, correlationId });

    return {
      ...user,
      // Where the client should go next. The server decides, so a role cannot
      // land somewhere it has no capability for.
      redirectTo: user.mustChangePassword
        ? '/profile?changePassword=1'
        : landingFor(user.roleKeys as RoleKey[]),
    };
  },
  {
    auth: false,
    schema: loginSchema,
    rateLimit: 'login',
    // Email + IP: stops a grind against one account without locking out
    // everyone who shares an office IP.
    rateLimitKey: ({ body, ip }) => `${body.email}:${ip}`,
  }
);

function landingFor(roleKeys: RoleKey[]): string {
  return dashboardFor(roleKeys) === 'admin' ? '/admin' : '/dashboard';
}
