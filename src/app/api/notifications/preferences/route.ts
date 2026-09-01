import { defineRoute } from '@/server/http/route';
import {
  getUserNotificationPreferences,
  updateUserNotificationPreference,
} from '@/server/notifications/preferences';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(async ({ user }) => {
  const preferences = await getUserNotificationPreferences(user);
  return { preferences };
});

export const POST = defineRoute(async ({ user, req }) => {
  const body = (await req.json()) as {
    eventCode?: string;
    channel?: 'IN_APP' | 'EMAIL' | 'SMS';
    enabled?: boolean;
  };

  if (!body.eventCode || !body.channel || typeof body.enabled !== 'boolean') {
    throw new Error('Invalid preference payload.');
  }

  return updateUserNotificationPreference(user, {
    eventCode: body.eventCode,
    channel: body.channel,
    enabled: body.enabled,
  });
});
