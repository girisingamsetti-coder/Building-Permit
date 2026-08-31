import { defineRoute } from '@/server/http/route';
import { markRead } from '@/server/notifications/inbox';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(async ({ user, params }) => markRead(user, params.id!));
