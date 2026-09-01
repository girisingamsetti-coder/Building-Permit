'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  FileText,
  ShieldAlert,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { formatRelativeTime } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

export type NotificationItem = {
  id: string;
  eventCode: string;
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: string;
  applicationNumber: string;
};

export type NotificationCounts = {
  ALL: number;
  UNREAD: number;
  APPLICATIONS: number;
  PAYMENTS: number;
  SHORTFALLS: number;
  APPROVALS: number;
  SYSTEM: number;
};

const CATEGORIES = [
  { key: 'ALL', label: 'All' },
  { key: 'UNREAD', label: 'Unread' },
  { key: 'APPLICATIONS', label: 'Applications' },
  { key: 'PAYMENTS', label: 'Payments' },
  { key: 'SHORTFALLS', label: 'Shortfalls' },
  { key: 'APPROVALS', label: 'Approvals' },
  { key: 'SYSTEM', label: 'System' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

export function NotificationCenter({
  initialNotifications,
  initialUnread,
  initialCounts,
}: {
  initialNotifications: NotificationItem[];
  initialUnread: number;
  initialCounts: NotificationCounts;
}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = React.useState<CategoryKey>('ALL');
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = React.useState(initialUnread);
  const [counts, setCounts] = React.useState<NotificationCounts>(initialCounts);
  const [loading, setLoading] = React.useState(false);

  const fetchNotifications = React.useCallback(async (cat: CategoryKey) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?category=${cat}&limit=100`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as {
          rows: NotificationItem[];
          unread: number;
          counts: NotificationCounts;
        };
        setNotifications(data.rows);
        setUnreadCount(data.unread);
        if (data.counts) setCounts(data.counts);
      }
    } catch {
      toast.error('Could not refresh notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCategoryChange = (cat: CategoryKey) => {
    setActiveCategory(cat);
    void fetchNotifications(cat);
  };

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      setCounts((prev) => ({ ...prev, UNREAD: Math.max(0, prev.UNREAD - 1) }));

      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch {
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      setCounts((prev) => ({ ...prev, UNREAD: 0 }));
      toast.success('All notifications marked as read');

      await fetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const getEventIcon = (eventCode: string) => {
    if (eventCode.startsWith('PAYMENT') || eventCode.startsWith('FEE')) {
      return <CreditCard className="size-4 text-emerald-600 dark:text-emerald-400" />;
    }
    if (eventCode.startsWith('SHORTFALL')) {
      return <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />;
    }
    if (eventCode.includes('APPROVED')) {
      return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />;
    }
    if (eventCode.includes('REJECTED') || eventCode.includes('FAILED')) {
      return <ShieldAlert className="size-4 text-rose-600 dark:text-rose-400" />;
    }
    if (eventCode.startsWith('SLA')) {
      return <Clock className="size-4 text-rose-600 dark:text-rose-400" />;
    }
    return <FileText className="size-4 text-primary" />;
  };

  return (
    <div className="space-y-4">
      {/* Category Tabs & Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/80 bg-surface-sunk p-1">
          {CATEGORIES.map((cat) => {
            const count = counts[cat.key] ?? 0;
            const active = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => handleCategoryChange(cat.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-small font-medium transition-all ${
                  active
                    ? 'bg-surface text-primary shadow-subtle'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                <span>{cat.label}</span>
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-caption font-semibold ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'bg-surface text-text-muted'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={handleMarkAllAsRead}>
            <CheckCheck className="size-4" />
            Mark All as Read
          </Button>
        )}
      </div>

      {/* Notification List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 py-3">
          <CardTitle className="text-body font-semibold flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <span>{CATEGORIES.find((c) => c.key === activeCategory)?.label} Notifications</span>
          </CardTitle>
          <span className="text-caption text-text-muted">
            {notifications.length} message{notifications.length === 1 ? '' : 's'}
          </span>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border/60">
          {loading ? (
            <div className="py-12 text-center text-text-muted text-small">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={Bell}
                title="No notifications found"
                description={`There are currently no notifications in the ${activeCategory.toLowerCase()} category.`}
              />
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  if (!item.isRead) void handleMarkAsRead(item.id);
                  if (item.link) router.push(item.link);
                }}
                className={`group flex items-start gap-3.5 p-4 transition-colors hover:bg-surface-sunk/60 cursor-pointer ${
                  !item.isRead ? 'bg-primary/5 dark:bg-primary/10' : ''
                }`}
              >
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface">
                  {getEventIcon(item.eventCode)}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className={`text-small ${!item.isRead ? 'font-bold text-text' : 'font-medium text-text'}`}>
                        {item.title}
                      </p>
                      {!item.isRead && (
                        <span className="size-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className="text-caption text-text-muted shrink-0">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>

                  <p className="text-small text-text-muted whitespace-pre-line leading-relaxed">
                    {item.message}
                  </p>

                  <div className="mt-2 flex items-center gap-2 pt-1">
                    {item.applicationNumber && (
                      <Badge tone="outline" className="text-caption font-mono">
                        {item.applicationNumber}
                      </Badge>
                    )}

                    {item.link && (
                      <Link
                        href={item.link}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!item.isRead) void handleMarkAsRead(item.id);
                        }}
                        className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline ml-auto"
                      >
                        <span>View Details</span>
                        <ArrowUpRight className="size-3" />
                      </Link>
                    )}

                    {!item.isRead && (
                      <button
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                        className="text-caption text-text-muted hover:text-text ml-2"
                        title="Mark as read"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
