import type { Metadata } from 'next';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { listNotificationLogs } from '@/server/services/notification-logs';
import { PageHeader } from '@/components/common/page-header';
import { NotificationLogsTable } from '@/features/admin/notification-logs-table';

export const metadata: Metadata = {
  title: 'SMS & Delivery Logs · Admin · LAMS',
};

export const dynamic = 'force-dynamic';

export default async function NotificationLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    channel?: string;
    status?: string;
    eventCode?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requirePageCapability(CAPABILITIES.NOTIFICATION_LOG_VIEW);

  const sp = await searchParams;
  const page = Number(sp.page ?? 1) || 1;
  const channel = sp.channel;
  const status = sp.status;
  const eventCode = sp.eventCode;
  const query = sp.q;

  const result = await listNotificationLogs({
    channel,
    status,
    eventCode,
    query,
    page,
    pageSize: 25,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="SMS & Delivery Logs"
        description="Audit log of all SMS, email, and in-app notifications dispatched by the system."
      />

      <NotificationLogsTable
        initialLogs={result.logs}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        totalPages={result.totalPages}
        stats={result.stats}
      />
    </div>
  );
}
