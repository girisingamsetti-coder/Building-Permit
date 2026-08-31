import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getTimeline } from '@/server/services/applications';

export const dynamic = 'force-dynamic';

/** The application's timeline, oldest first. Access-checked before it is read. */
export const GET = defineRoute(
  async ({ user, params }) => ({ data: await getTimeline(user, params.id!) }),
  { capabilities: [CAPABILITIES.APPLICATION_VIEW] }
);
