import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { updateUserSchema, type UpdateUserInput } from '@/lib/schemas/users';
import { getUser, getUserActivity, updateUser } from '@/server/services/users';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  async ({ params, searchParams }) => {
    const id = params.id!;
    const user = await getUser(id);
    if (searchParams.get('activity') !== 'true') return user;
    return { ...user, activity: await getUserActivity(id) };
  },
  { capabilities: [CAPABILITIES.USER_MANAGE] }
);

export const PATCH = defineRoute<UpdateUserInput>(
  async ({ params, body, user, ip, userAgent, correlationId }) =>
    updateUser(params.id!, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.USER_MANAGE], schema: updateUserSchema }
);
