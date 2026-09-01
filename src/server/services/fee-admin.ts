import 'server-only';
import { prisma } from '@/server/db/prisma';
import { badRequest, notFound } from '@/server/http/errors';
import { audit } from './audit';
import type { AuthUser } from '@/server/auth/context';

type Meta = { ip?: string; userAgent?: string; correlationId?: string };

// ═══════════════════════════════════════════════════════════════════════════
// FEE STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════

const COMPONENT_SELECT = {
  id: true,
  code: true,
  name: true,
  basis: true,
  rate: true,
  variable: true,
  percentOfCode: true,
  expression: true,
  headOfAccount: true,
  minAmount: true,
  maxAmount: true,
  displayOrder: true,
  isActive: true,
  isRefundable: true,
} as const;

const STRUCTURE_SELECT = {
  id: true,
  code: true,
  name: true,
  version: true,
  effectiveFrom: true,
  effectiveTo: true,
  roundingRule: true,
  isPlaceholder: true,
  isActive: true,
  notes: true,
  applicationTypeId: true,
  applicationType: { select: { id: true, name: true } },
  components: {
    orderBy: { displayOrder: 'asc' as const },
    select: COMPONENT_SELECT,
  },
  _count: { select: { rules: true } },
} as const;

export async function listFeeStructures() {
  return prisma.feeStructure.findMany({
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
    select: STRUCTURE_SELECT,
  });
}

export async function getFeeStructure(id: string) {
  const structure = await prisma.feeStructure.findUnique({
    where: { id },
    select: {
      ...STRUCTURE_SELECT,
      rules: {
        orderBy: { displayOrder: 'asc' as const },
        select: { id: true, code: true, name: true, basis: true, kind: true, rate: true, appliesToCode: true, minAmount: true, maxAmount: true, condition: true, reason: true, displayOrder: true, isActive: true },
      },
    },
  });
  if (!structure) throw notFound('Fee structure not found.');
  return structure;
}

export async function createFeeStructure(
  input: { code: string; name: string; applicationTypeId?: string | null; effectiveFrom: string; effectiveTo?: string | null; roundingRule?: string; notes?: string },
  actor: AuthUser,
  meta: Meta = {}
) {
  return prisma.$transaction(async (tx) => {
    const maxVersion = await tx.feeStructure.aggregate({ where: { code: input.code }, _max: { version: true } });
    const version = (maxVersion._max.version ?? 0) + 1;
    const structure = await tx.feeStructure.create({
      data: {
        code: input.code.toUpperCase(),
        name: input.name,
        version,
        applicationTypeId: input.applicationTypeId ?? null,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        roundingRule: input.roundingRule ?? 'NEAREST_1',
        notes: input.notes ?? '',
        isActive: true,
        isPlaceholder: false,
        createdById: actor.id,
      },
      select: { id: true, code: true, name: true, version: true },
    });
    await audit(tx, { actor, action: 'FEE_STRUCTURE_CREATED', entityType: 'FeeStructure', entityId: structure.id, after: structure, ...meta });
    return structure;
  });
}

export async function updateFeeStructure(
  id: string,
  input: { name?: string; effectiveTo?: string | null; roundingRule?: string; notes?: string; isActive?: boolean },
  actor: AuthUser,
  meta: Meta = {}
) {
  const structure = await prisma.feeStructure.findUnique({ where: { id } });
  if (!structure) throw notFound('Fee structure not found.');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.feeStructure.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null } : {}),
        ...(input.roundingRule ? { roundingRule: input.roundingRule } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: { id: true, code: true, name: true },
    });
    await audit(tx, { actor, action: 'FEE_STRUCTURE_UPDATED', entityType: 'FeeStructure', entityId: id, before: { name: structure.name }, after: updated, ...meta });
    return updated;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FEE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface FeeComponentInput {
  code: string;
  name: string;
  basis: string;
  rate?: number | null;
  variable?: string;
  percentOfCode?: string;
  expression?: string;
  headOfAccount?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  isRefundable?: boolean;
}

export async function addFeeComponent(structureId: string, input: FeeComponentInput, actor: AuthUser, meta: Meta = {}) {
  const structure = await prisma.feeStructure.findUnique({ where: { id: structureId } });
  if (!structure) throw notFound('Fee structure not found.');

  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.feeComponent.aggregate({ where: { feeStructureId: structureId }, _max: { displayOrder: true } });
    const component = await tx.feeComponent.create({
      data: {
        feeStructureId: structureId,
        code: input.code.toUpperCase(),
        name: input.name,
        basis: input.basis,
        rate: input.rate ?? null,
        variable: input.variable ?? '',
        percentOfCode: input.percentOfCode ?? '',
        expression: input.expression ?? '',
        headOfAccount: input.headOfAccount ?? '',
        minAmount: input.minAmount ?? null,
        maxAmount: input.maxAmount ?? null,
        isRefundable: input.isRefundable ?? false,
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        isActive: true,
      },
      select: COMPONENT_SELECT,
    });
    await audit(tx, { actor, action: 'FEE_COMPONENT_ADDED', entityType: 'FeeComponent', entityId: component.id, after: { code: component.code, name: component.name }, ...meta });
    return component;
  });
}

export async function updateFeeComponent(
  id: string,
  input: Partial<FeeComponentInput> & { isActive?: boolean },
  actor: AuthUser,
  meta: Meta = {}
) {
  const component = await prisma.feeComponent.findUnique({ where: { id } });
  if (!component) throw notFound('Fee component not found.');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.feeComponent.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.basis ? { basis: input.basis } : {}),
        ...(input.rate !== undefined ? { rate: input.rate } : {}),
        ...(input.variable !== undefined ? { variable: input.variable } : {}),
        ...(input.percentOfCode !== undefined ? { percentOfCode: input.percentOfCode } : {}),
        ...(input.expression !== undefined ? { expression: input.expression } : {}),
        ...(input.headOfAccount !== undefined ? { headOfAccount: input.headOfAccount } : {}),
        ...(input.minAmount !== undefined ? { minAmount: input.minAmount } : {}),
        ...(input.maxAmount !== undefined ? { maxAmount: input.maxAmount } : {}),
        ...(input.isRefundable !== undefined ? { isRefundable: input.isRefundable } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: COMPONENT_SELECT,
    });
    await audit(tx, { actor, action: 'FEE_COMPONENT_UPDATED', entityType: 'FeeComponent', entityId: id, before: { name: component.name }, after: updated, ...meta });
    return updated;
  });
}

export async function removeFeeComponent(id: string, actor: AuthUser, meta: Meta = {}) {
  const component = await prisma.feeComponent.findUnique({ where: { id } });
  if (!component) throw notFound('Fee component not found.');

  return prisma.$transaction(async (tx) => {
    await tx.feeComponent.delete({ where: { id } });
    await audit(tx, { actor, action: 'FEE_COMPONENT_REMOVED', entityType: 'FeeComponent', entityId: id, before: { code: component.code, name: component.name }, ...meta });
    return { ok: true };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FEE RULES
// ═══════════════════════════════════════════════════════════════════════════

export interface FeeRuleInput {
  code: string;
  name: string;
  kind: string;
  basis: string;
  rate?: number | null;
  appliesToCode?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  condition?: unknown;
  reason?: string;
}

export async function addFeeRule(structureId: string, input: FeeRuleInput, actor: AuthUser, meta: Meta = {}) {
  const structure = await prisma.feeStructure.findUnique({ where: { id: structureId } });
  if (!structure) throw notFound('Fee structure not found.');
  if (!input.rate && input.basis !== 'FLAT') throw badRequest('A rate is required for non-FLAT rules.');

  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.feeRule.aggregate({ where: { feeStructureId: structureId }, _max: { displayOrder: true } });
    const rule = await tx.feeRule.create({
      data: {
        feeStructureId: structureId,
        code: input.code.toUpperCase(),
        name: input.name,
        kind: input.kind,
        basis: input.basis,
        rate: input.rate ?? null,
        appliesToCode: input.appliesToCode ?? '',
        minAmount: input.minAmount ?? null,
        maxAmount: input.maxAmount ?? null,
        condition: (input.condition as object) ?? {},
        reason: input.reason ?? '',
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        isActive: true,
      },
      select: { id: true, code: true, name: true, kind: true, basis: true, rate: true },
    });
    await audit(tx, { actor, action: 'FEE_RULE_ADDED', entityType: 'FeeRule', entityId: rule.id, after: rule, ...meta });
    return rule;
  });
}

export async function updateFeeRule(
  id: string,
  input: Partial<FeeRuleInput> & { isActive?: boolean },
  actor: AuthUser,
  meta: Meta = {}
) {
  const rule = await prisma.feeRule.findUnique({ where: { id } });
  if (!rule) throw notFound('Fee rule not found.');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.feeRule.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.basis ? { basis: input.basis } : {}),
        ...(input.rate !== undefined ? { rate: input.rate } : {}),
        ...(input.appliesToCode !== undefined ? { appliesToCode: input.appliesToCode } : {}),
        ...(input.minAmount !== undefined ? { minAmount: input.minAmount } : {}),
        ...(input.maxAmount !== undefined ? { maxAmount: input.maxAmount } : {}),
        ...(input.condition !== undefined ? { condition: input.condition as object } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: { id: true, code: true, name: true },
    });
    await audit(tx, { actor, action: 'FEE_RULE_UPDATED', entityType: 'FeeRule', entityId: id, before: { name: rule.name }, after: updated, ...meta });
    return updated;
  });
}

export async function removeFeeRule(id: string, actor: AuthUser, meta: Meta = {}) {
  const rule = await prisma.feeRule.findUnique({ where: { id } });
  if (!rule) throw notFound('Fee rule not found.');

  return prisma.$transaction(async (tx) => {
    await tx.feeRule.delete({ where: { id } });
    await audit(tx, { actor, action: 'FEE_RULE_REMOVED', entityType: 'FeeRule', entityId: id, before: { code: rule.code, name: rule.name }, ...meta });
    return { ok: true };
  });
}
