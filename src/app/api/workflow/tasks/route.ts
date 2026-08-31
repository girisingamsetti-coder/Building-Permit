import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listTasks } from '@/server/workflow/tasks';

export const dynamic = 'force-dynamic';

/**
 * The officer's inbox.
 *
 * One endpoint for every desk. What comes back is decided by the roles the
 * caller holds and the zones they cover, merged into the query rather than
 * filtered afterwards — so a task belonging to another zone is never loaded,
 * and the counts on the filter chips are counts of what this officer can
 * actually see.
 */
export const GET = defineRoute(
  async ({ user, searchParams }) =>
    listTasks(user, {
      filter: searchParams.get('filter') ?? undefined,
      q: searchParams.get('q')?.trim() || undefined,
      stage: searchParams.get('stage') ?? undefined,
      page: Number(searchParams.get('page') ?? 1) || 1,
      pageSize: Number(searchParams.get('pageSize') ?? 20) || 20,
      sort: searchParams.get('sort') ?? undefined,
      dir: searchParams.get('dir') === 'asc' ? 'asc' : 'desc',
    }),
  { capabilities: [CAPABILITIES.WORKFLOW_VIEW] }
);
