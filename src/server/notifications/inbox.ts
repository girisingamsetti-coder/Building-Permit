import 'server-only';
import { prisma } from '@/server/db/prisma';
import type { AuthUser } from '@/server/auth/context';

/**
 * The notification centre — one person's own messages.
 *
 * Scoped by `userId` and nothing else, and there is deliberately no parameter
 * that widens it: a notification is addressed to a person, and no capability
 * grants reading somebody else's. An administrator auditing what was sent
 * reads `notification_logs`, which is a different question with a different
 * screen.
 */

export type InboxQuery = { unreadOnly?: boolean; limit?: number };

export async function listNotifications(user: AuthUser, query: InboxQuery = {}) {
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, ...(query.unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventCode: true,
        title: true,
        message: true,
        link: true,
        isRead: true,
        readAt: true,
        createdAt: true,
        applicationId: true,
        application: { select: { applicationNumber: true } },
      },
    }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      eventCode: row.eventCode,
      title: row.title,
      message: row.message,
      // Stored absolute so the same row can be an email link; the bell wants a
      // path, so the origin is stripped here rather than in the component.
      link: row.link.replace(/^https?:\/\/[^/]+/, ''),
      isRead: row.isRead,
      createdAt: row.createdAt,
      applicationNumber: row.application?.applicationNumber ?? '',
    })),
    unread,
  };
}

/**
 * Marks one as read.
 *
 * `updateMany` with the user id in the WHERE: a notification belonging to
 * somebody else matches nothing and is reported as such, rather than being
 * fetched, checked and refused — which is one fewer place to forget the check.
 */
export async function markRead(user: AuthUser, notificationId: string) {
  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return { updated: count };
}

export async function markAllRead(user: AuthUser) {
  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return { updated: count };
}
