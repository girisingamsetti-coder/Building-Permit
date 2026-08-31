import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { createUserSchema, userListQuerySchema, type CreateUserInput } from '@/lib/schemas/users';
import { listUsers, createUser } from '@/server/services/users';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  async ({ searchParams }) => {
    const query = userListQuerySchema.parse(Object.fromEntries(searchParams));
    return listUsers(query);
  },
  { capabilities: [CAPABILITIES.USER_MANAGE] }
);

export const POST = defineRoute<CreateUserInput>(
  async ({ body, user, ip, userAgent, correlationId }) =>
    createUser(body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.USER_MANAGE], schema: createUserSchema }
);
