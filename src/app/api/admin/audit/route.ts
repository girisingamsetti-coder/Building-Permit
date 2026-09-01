import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listAuditLogs, listAuditEntityTypes, listAuditActions } from '@/server/services/audit-log';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  async ({ searchParams }) => {
    const page = Number(searchParams.get('page') ?? '1');
    const pageSize = Math.min(100, Number(searchParams.get('pageSize') ?? '50'));
    const filters = {
      search: searchParams.get('search') ?? undefined,
      entityType: searchParams.get('entityType') ?? undefined,
      action: searchParams.get('action') ?? undefined,
      actorId: searchParams.get('actorId') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
    };

    if (searchParams.get('meta') === 'true') {
      const [entityTypes, actions] = await Promise.all([listAuditEntityTypes(), listAuditActions()]);
      return { entityTypes, actions };
    }

    return listAuditLogs(filters, { page, pageSize });
  },
  { capabilities: [CAPABILITIES.AUDIT_VIEW] }
);
