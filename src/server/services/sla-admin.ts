import 'server-only';
import { prisma } from '@/server/db/prisma';
import { audit } from './audit';
import { badRequest, notFound } from '@/server/http/errors';
import type { AuthUser } from '@/server/auth/context';

type Meta = { ip?: string; userAgent?: string; correlationId?: string };

export interface SlaRuleInput {
  workflowStageId: string;
  applicationTypeId?: string | null;
  days: number;
  calendar: string;
  warnAtPercent: number;
  escalateToRoleKey?: string | null;
  pauseOnShortfall: boolean;
}

const SLA_SELECT = {
  id: true,
  days: true,
  calendar: true,
  warnAtPercent: true,
  escalateToRoleKey: true,
  pauseOnShortfall: true,
  isActive: true,
  workflowStageId: true,
  applicationTypeId: true,
  stage: { select: { id: true, code: true, name: true, sequence: true } },
  applicationType: { select: { id: true, name: true } },
} as const;

export async function listSlaRules() {
  return prisma.slaRule.findMany({
    orderBy: [{ stage: { sequence: 'asc' } }],
    select: SLA_SELECT,
  });
}

export async function createSlaRule(input: SlaRuleInput, actor: AuthUser, meta: Meta = {}) {
  if (input.days < 1) throw badRequest('SLA days must be at least 1.');
  if (input.warnAtPercent < 1 || input.warnAtPercent > 100)
    throw badRequest('Warning threshold must be between 1 and 100 percent.');

  const stage = await prisma.workflowStage.findUnique({ where: { id: input.workflowStageId } });
  if (!stage) throw notFound('Workflow stage not found.');

  return prisma.$transaction(async (tx) => {
    const rule = await tx.slaRule.create({
      data: {
        workflowStageId: input.workflowStageId,
        applicationTypeId: input.applicationTypeId ?? null,
        days: input.days,
        calendar: input.calendar,
        warnAtPercent: input.warnAtPercent,
        escalateToRoleKey: input.escalateToRoleKey ?? null,
        pauseOnShortfall: input.pauseOnShortfall,
        isActive: true,
      },
      select: SLA_SELECT,
    });
    await audit(tx, { actor, action: 'SLA_RULE_CREATED', entityType: 'SlaRule', entityId: rule.id, after: { workflowStageId: input.workflowStageId, days: input.days }, ...meta });
    return rule;
  });
}

export async function updateSlaRule(id: string, input: Partial<Omit<SlaRuleInput, 'workflowStageId' | 'applicationTypeId'>> & { isActive?: boolean }, actor: AuthUser, meta: Meta = {}) {
  const rule = await prisma.slaRule.findUnique({ where: { id }, select: SLA_SELECT });
  if (!rule) throw notFound('SLA rule not found.');

  if (input.days !== undefined && input.days < 1) throw badRequest('SLA days must be at least 1.');
  if (input.warnAtPercent !== undefined && (input.warnAtPercent < 1 || input.warnAtPercent > 100))
    throw badRequest('Warning threshold must be between 1 and 100 percent.');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.slaRule.update({
      where: { id },
      data: {
        ...(input.days !== undefined ? { days: input.days } : {}),
        ...(input.calendar ? { calendar: input.calendar } : {}),
        ...(input.warnAtPercent !== undefined ? { warnAtPercent: input.warnAtPercent } : {}),
        ...(input.escalateToRoleKey !== undefined ? { escalateToRoleKey: input.escalateToRoleKey } : {}),
        ...(input.pauseOnShortfall !== undefined ? { pauseOnShortfall: input.pauseOnShortfall } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: SLA_SELECT,
    });
    await audit(tx, { actor, action: 'SLA_RULE_UPDATED', entityType: 'SlaRule', entityId: id, before: rule, after: updated, ...meta });
    return updated;
  });
}

export async function deleteSlaRule(id: string, actor: AuthUser, meta: Meta = {}) {
  const rule = await prisma.slaRule.findUnique({ where: { id }, select: { id: true, workflowStageId: true } });
  if (!rule) throw notFound('SLA rule not found.');

  return prisma.$transaction(async (tx) => {
    await tx.slaRule.delete({ where: { id } });
    await audit(tx, { actor, action: 'SLA_RULE_DELETED', entityType: 'SlaRule', entityId: id, before: { id }, ...meta });
    return { ok: true };
  });
}
