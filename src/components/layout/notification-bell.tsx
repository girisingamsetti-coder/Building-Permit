'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { cn } from '@/lib/utils';

/**
 * The notification centre.
 *
 * ── It only counts what it can show ──────────────────────────────────────
 *
 * The badge is the number of unread rows the server returned for THIS user.
 * There is no cached count and no optimistic increment, because a bell showing
 * "3" over an empty list is the fastest way to teach somebody to stop looking
 * at it.
 *
 * ── Polling, not sockets ─────────────────────────────────────────────────
 *
 * Every sixty seconds while the tab is visible, and once on open. A shortfall
 * is not a chat message: a minute's delay costs nobody anything, and a
 * WebSocket would be a second connection to run, secure and scale for a badge.
 */

type Notification = {
  id: string;
  eventCode: string;
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: string;
  applicationNumber: string;
};

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [rows, setRows] = React.useState<Notification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const response = await fetch('/api/notifications?limit=15', { cache: 'no-store' });
      if (!response.ok) return;

      const body = (await response.json()) as { rows: Notification[]; unread: number };
      setRows(body.rows);
      setUnread(body.unread);
    } catch {
      // A bell that cannot reach the server shows what it last knew. Blanking
      // it would look like "nothing has happened", which is a different and
      // wrong statement.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();

    const timer = setInterval(() => {
      // Nothing is polled behind a hidden tab: a laptop with forty tabs open
      // should not be making forty requests a minute.
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [load]);

  async function open(notification: Notification) {
    if (!notification.isRead) {
      setUnread((n) => Math.max(0, n - 1));
      setRows((current) =>
        current.map((r) => (r.id === notification.id ? { ...r, isRead: true } : r))
      );
      await fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' }).catch(() => {});
    }

    if (notification.link) router.push(notification.link);
  }

  async function readAll() {
    setUnread(0);
    setRows((current) => current.map((r) => ({ ...r, isRead: true })));
    await fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
    void load();
  }

  return (
    <DropdownMenu onOpenChange={(isOpen) => isOpen && void load()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread ? `Notifications — ${unread} unread` : 'Notifications'}
        >
          <Bell />
          {unread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-[18px] text-white"
              aria-hidden
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-small font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={readAll} className="h-7 gap-1.5 px-2">
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={loading ? 'Loading…' : 'Nothing yet'}
            description={
              loading
                ? ''
                : 'Shortfalls, payments and decisions on your applications appear here.'
            }
            className="py-8"
          />
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => open(row)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2.5 text-left last:border-b-0',
                    'hover:bg-surface-sunk focus-visible:outline-none focus-visible:bg-surface-sunk',
                    !row.isRead && 'bg-info-bg/40'
                  )}
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        'min-w-0 truncate text-small',
                        row.isRead ? 'text-text' : 'font-semibold text-text'
                      )}
                    >
                      {row.title}
                    </span>
                    <time
                      className="shrink-0 text-caption tabular-nums text-text-muted"
                      dateTime={row.createdAt}
                    >
                      {relative(row.createdAt)}
                    </time>
                  </span>

                  <span className="line-clamp-2 text-caption text-text-muted">{row.message}</span>

                  {row.applicationNumber && (
                    <span className="text-caption text-text-subtle">{row.applicationNumber}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Link href="/notifications" className="text-caption font-medium text-primary hover:underline">
            View all in Notification Center
          </Link>
          <Link href="/profile#notifications" className="text-caption text-text-muted hover:text-text">
            Settings
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "4m", "2h", "3d". A timestamp in a dropdown is noise; elapsed time is not. */
function relative(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;

  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
