import 'server-only';
import { prisma } from '@/server/db/prisma';
import type { AuthUser } from '@/server/auth/context';

export type NotificationCategory =
  | 'ALL'
  | 'UNREAD'
  | 'APPLICATIONS'
  | 'PAYMENTS'
  | 'SHORTFALLS'
  | 'APPROVALS'
  | 'SYSTEM';

export type InboxQuery = {
  unreadOnly?: boolean;
  category?: NotificationCategory;
  limit?: number;
};

const CATEGORY_EVENT_PATTERNS: Record<Exclude<NotificationCategory, 'ALL' | 'UNREAD'>, string[]> = {
  APPLICATIONS: [
    'APPLICATION_CREATED',
    'APPLICATION_SUBMITTED',
    'DRAWING_UPLOADED',
    'SCRUTINY_PASSED',
    'SCRUTINY_FAILED',
    'DOCUMENTS_PENDING',
    'DOCUMENTS_COMPLETED',
    'DOCUMENTS_COMPLETE',
    'APPLICATION_FORWARDED',
    'APPLICATION_RETURNED',
  ],
  PAYMENTS: ['FEE_GENERATED', 'PAYMENT_PENDING', 'PAYMENT_SUCCESSFUL', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED'],
  SHORTFALLS: ['SHORTFALL_RAISED', 'SHORTFALL_RESPONDED', 'SHORTFALL_RESOLVED', 'SHORTFALL_REJECTED'],
  APPROVALS: ['APPLICATION_APPROVED', 'APPLICATION_REJECTED', 'ORDER_ISSUED'],
  SYSTEM: ['SLA_DUE_SOON', 'SLA_OVERDUE', 'SLA_BREACHED', 'TASK_ASSIGNED', 'USER_CREATED', 'PASSWORD_RESET'],
};

export async function listNotifications(user: AuthUser, query: InboxQuery = {}) {
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  const category = query.category ?? 'ALL';
  const unreadOnly = query.unreadOnly || category === 'UNREAD';

  const whereClause: {
    userId: string;
    isRead?: boolean;
    eventCode?: { in: string[] };
  } = {
    userId: user.id,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  if (category && category !== 'ALL' && category !== 'UNREAD') {
    const validCodes = CATEGORY_EVENT_PATTERNS[category];
    if (validCodes) {
      whereClause.eventCode = { in: validCodes };
    }
  }

  const [rows, unread, countsByCategory] = await Promise.all([
    prisma.notification.findMany({
      where: whereClause,
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
    getCategoryCounts(user.id),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      eventCode: row.eventCode,
      title: row.title,
      message: row.message,
      link: row.link.replace(/^https?:\/\/[^/]+/, ''),
      isRead: row.isRead,
      createdAt: row.createdAt,
      applicationNumber: row.application?.applicationNumber ?? '',
    })),
    unread,
    counts: countsByCategory,
  };
}

async function getCategoryCounts(userId: string) {
  const allNotifications = await prisma.notification.findMany({
    where: { userId },
    select: { eventCode: true, isRead: true },
  });

  const counts = {
    ALL: allNotifications.length,
    UNREAD: allNotifications.filter((n) => !n.isRead).length,
    APPLICATIONS: 0,
    PAYMENTS: 0,
    SHORTFALLS: 0,
    APPROVALS: 0,
    SYSTEM: 0,
  };

  for (const n of allNotifications) {
    if (CATEGORY_EVENT_PATTERNS.APPLICATIONS.includes(n.eventCode)) counts.APPLICATIONS++;
    else if (CATEGORY_EVENT_PATTERNS.PAYMENTS.includes(n.eventCode)) counts.PAYMENTS++;
    else if (CATEGORY_EVENT_PATTERNS.SHORTFALLS.includes(n.eventCode)) counts.SHORTFALLS++;
    else if (CATEGORY_EVENT_PATTERNS.APPROVALS.includes(n.eventCode)) counts.APPROVALS++;
    else counts.SYSTEM++;
  }

  return counts;
}

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
