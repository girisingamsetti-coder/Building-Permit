import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getDashboardStats, getRecentApplications } from '@/server/services/applications';

export const dynamic = 'force-dynamic';

/**
 * Dashboard KPI counts, plus the recent-applications table.
 *
 * A static segment, so Next resolves it before `[id]` — an application id is a
 * UUID and can never collide with "stats".
 *
 * Both halves are scoped to the caller inside the service, so the tiles count
 * exactly the rows the list would show.
 */
export const GET = defineRoute(
  async ({ user, searchParams }) => {
    const limit = Math.min(Math.max(Number(searchParams.get('recent') ?? 8) || 8, 1), 25);
    const [stats, recent] = await Promise.all([
      getDashboardStats(user),
      getRecentApplications(user, limit),
    ]);
    return { ...stats, recent };
  },
  { capabilities: [CAPABILITIES.APPLICATION_VIEW] }
);
