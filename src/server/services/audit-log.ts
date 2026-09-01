import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/prisma';

export interface AuditLogFilters {
  actorId?: string;
  entityType?: string;
  action?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogPage {
  page: number;
  pageSize: number;
}

export async function listAuditLogs(filters: AuditLogFilters = {}, pagination: AuditLogPage = { page: 1, pageSize: 50 }) {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.action) where.action = { contains: filters.action };
  if (filters.search) {
    where.OR = [
      { actorName: { contains: filters.search } },
      { action: { contains: filters.search } },
      { entityType: { contains: filters.search } },
      { remarks: { contains: filters.search } },
    ];
  }
  if (filters.dateFrom || filters.dateTo) {
    where.occurredAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { seq: 'desc' },
      skip,
      take: pagination.pageSize,
      select: {
        id: true,
        seq: true,
        actorId: true,
        actorName: true,
        actorRoleKey: true,
        action: true,
        entityType: true,
        entityId: true,
        applicationId: true,
        before: true,
        after: true,
        remarks: true,
        ip: true,
        occurredAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: rows,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

/** Distinct entity types for filter dropdown */
export async function listAuditEntityTypes() {
  const rows = await prisma.auditLog.findMany({
    distinct: ['entityType'],
    select: { entityType: true },
    orderBy: { entityType: 'asc' },
  });
  return rows.map((r) => r.entityType);
}

/** Distinct action codes for filter dropdown */
export async function listAuditActions() {
  const rows = await prisma.auditLog.findMany({
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
  });
  return rows.map((r) => r.action);
}
