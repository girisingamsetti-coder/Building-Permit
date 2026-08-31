import { defineRoute } from '@/server/http/route';
import { env } from '@/server/config/env';

export const dynamic = 'force-dynamic';

/**
 * The resolved session: who the caller is, and what they may do.
 *
 * The client uses this to decide what chrome to render — never what to
 * permit. Every mutation re-derives capability, row scope and stage ownership
 * on the server regardless of what this returned.
 *
 * Requires a session, so it is also the endpoint that proves the route
 * wrapper's 401 path works.
 */
export const GET = defineRoute(async ({ user }) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  roleKeys: user.roleKeys,
  capabilities: user.capabilities.slice().sort(),
  zoneIds: user.zoneIds,
  officeId: user.officeId,
  demoMode: env.demoMode,
}));
