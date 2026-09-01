import { defineRoute } from '@/server/http/route';
import { listNotifications, type NotificationCategory } from '@/server/notifications/inbox';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(async ({ user, searchParams }) =>
  listNotifications(user, {
    unreadOnly: searchParams.get('unread') === 'true',
    category: (searchParams.get('category')?.toUpperCase() as NotificationCategory) || undefined,
    limit: Number(searchParams.get('limit') ?? 20) || 20,
  })
);
