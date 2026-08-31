import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { parseDocumentListQuery } from '@/lib/schemas/documents';
import { documentRegisterStats, listDocumentRegister } from '@/server/services/documents';

export const dynamic = 'force-dynamic';

/**
 * The cross-application document register.
 *
 * `listDocumentRegister` merges the caller's row scope into the query, so an
 * LTP sees their own documents and a zonal officer sees their jurisdiction —
 * no query parameter widens either.
 */
export const GET = defineRoute(
  async ({ user, searchParams }) => {
    const query = parseDocumentListQuery(searchParams);

    if (searchParams.get('stats') === 'true') {
      const [result, stats] = await Promise.all([
        listDocumentRegister(user, query),
        documentRegisterStats(user),
      ]);
      return { ...result, stats };
    }

    return listDocumentRegister(user, query);
  },
  { capabilities: [CAPABILITIES.DOCUMENT_VIEW] }
);
