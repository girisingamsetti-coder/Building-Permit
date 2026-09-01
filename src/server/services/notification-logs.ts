import 'server-only';
import { prisma } from '@/server/db/prisma';

export type LogQuery = {
  channel?: string;
  status?: string;
  eventCode?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};

export async function listNotificationLogs(params: LogQuery = {}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  const where: {
    channel?: string;
    status?: string;
    eventCode?: string;
    OR?: Array<{ recipient?: { contains: string }; body?: { contains: string } }>;
  } = {};

  if (params.channel && params.channel !== 'ALL') {
    where.channel = params.channel;
  }

  if (params.status && params.status !== 'ALL') {
    where.status = params.status;
  }

  if (params.eventCode && params.eventCode !== 'ALL') {
    where.eventCode = params.eventCode;
  }

  if (params.query?.trim()) {
    const q = params.query.trim();
    where.OR = [{ recipient: { contains: q } }, { body: { contains: q } }];
  }

  const [logs, total, stats] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        channel: true,
        eventCode: true,
        recipient: true,
        subject: true,
        body: true,
        status: true,
        provider: true,
        providerRef: true,
        errorMessage: true,
        sentAt: true,
        createdAt: true,
      },
    }),
    prisma.notificationLog.count({ where }),
    prisma.notificationLog.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {
    SENT: 0,
    FAILED: 0,
    SKIPPED: 0,
    QUEUED: 0,
  };

  for (const s of stats) {
    statusCounts[s.status] = s._count._all;
  }

  return {
    logs: logs.map((log) => ({
      id: log.id,
      channel: log.channel,
      eventCode: log.eventCode,
      recipient: log.recipient,
      subject: log.subject,
      body: log.body,
      status: log.status,
      provider: log.provider,
      providerRef: log.providerRef,
      errorMessage: log.errorMessage,
      sentAt: log.sentAt ? log.sentAt.toISOString() : null,
      createdAt: log.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    stats: statusCounts,
  };
}
