import type { Metadata } from 'next';
import { requirePageUser } from '@/server/auth/page-guard';
import { listNotifications } from '@/server/notifications/inbox';
import { PageHeader } from '@/components/common/page-header';
import { NotificationCenter } from '@/features/notifications/notification-center';

export const metadata: Metadata = {
  title: 'Notification Center · LAMS',
};

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requirePageUser();
  const { rows, unread, counts } = await listNotifications(user, { limit: 100 });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notification Center"
        description="Your communications, alerts, and workflow notices."
      />

      <NotificationCenter
        initialNotifications={rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        }))}
        initialUnread={unread}
        initialCounts={counts}
      />
    </div>
  );
}
