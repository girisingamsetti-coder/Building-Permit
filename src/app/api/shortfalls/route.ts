import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listShortfalls, shortfallSummary } from '@/server/shortfalls/queries';

export const dynamic = 'force-dynamic';

/**
 * The shortfall register, across applications.
 *
 * SHORTFALL_VIEW, which the LTP holds for their own files and every officer
 * holds for the ones in their scope. `listShortfalls` merges that scope into
 * the query through `applicationScope`, so no parameter here can widen it —
 * which matters most on exactly this endpoint, where a leak would be a list of
 * other people's problems.
 */
export const GET = defineRoute(
  async ({ user, searchParams }) => {
    const query = {
      filter: searchParams.get('filter') ?? undefined,
      kind: searchParams.get('kind') ?? undefined,
      q: searchParams.get('q')?.trim() || undefined,
      applicationId: searchParams.get('applicationId') ?? undefined,
      page: Number(searchParams.get('page') ?? 1) || 1,
      pageSize: Number(searchParams.get('pageSize') ?? 20) || 20,
    };

    if (searchParams.get('summary') === 'true') {
      const [result, summary] = await Promise.all([
        listShortfalls(user, query),
        shortfallSummary(user),
      ]);
      return { ...result, summary };
    }

    return listShortfalls(user, query);
  },
  { capabilities: [CAPABILITIES.SHORTFALL_VIEW] }
);
