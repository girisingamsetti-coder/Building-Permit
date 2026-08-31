import { defineRoute, created } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { createApplicationSchema, parseListQuery, type CreateApplicationInput } from '@/lib/schemas/applications';
import { createApplication, listApplications } from '@/server/services/applications';

export const dynamic = 'force-dynamic';

/**
 * The application register, scoped to the caller.
 *
 * No `ltpUserId` or `zoneId` parameter is accepted for narrowing to somebody
 * else's files — scope is derived from the session inside the service. A query
 * string cannot widen what a role may see.
 */
export const GET = defineRoute(
  async ({ user, searchParams }) => listApplications(user, parseListQuery(searchParams)),
  { capabilities: [CAPABILITIES.APPLICATION_VIEW] }
);

export const POST = defineRoute<CreateApplicationInput>(
  async ({ user, body, ip, userAgent, correlationId }) =>
    created(await createApplication(user, body, { ip, userAgent, correlationId })),
  { capabilities: [CAPABILITIES.APPLICATION_CREATE], schema: createApplicationSchema }
);
