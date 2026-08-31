import { defineRoute } from '@/server/http/route';
import { listNotifications } from '@/server/notifications/inbox';

export const dynamic = 'force-dynamic';

/**
 * This user's notifications.
 *
 * No capability: everybody with an account has an inbox, and it contains only
 * what was addressed to them. Requiring a capability here would mean a role
 * could be configured that receives messages it cannot read.
 */
export const GET = defineRoute(async ({ user, searchParams }) =>
  listNotifications(user, {
    unreadOnly: searchParams.get('unread') === 'true',
    limit: Number(searchParams.get('limit') ?? 20) || 20,
  })
);
