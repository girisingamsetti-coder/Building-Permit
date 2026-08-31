import { defineRoute } from '@/server/http/route';
import { markAllRead } from '@/server/notifications/inbox';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(async ({ user }) => markAllRead(user));
