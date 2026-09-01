import 'server-only';
import { prisma } from '@/server/db/prisma';
import { audit } from './audit';
import { badRequest, businessRule, conflict, notFound } from '@/server/http/errors';
import type { AuthUser } from '@/server/auth/context';

type Meta = { ip?: string; userAgent?: string; correlationId?: string };

// ═══════════════════════════════════════════════════════════════════════════
// Shapes
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  sequence: true,
  ownerRoleKeys: true,
  entryStatus: true,
  workingStatus: true,
  slaDays: true,
  isEntry: true,
  isTerminal: true,
  allowReassign: true,
  description: true,
  isActive: true,
} as const;

const TRANSITION_SELECT = {
  id: true,
  fromStageId: true,
  actionId: true,
  fromStatus: true,
  toStageId: true,
  toStatus: true,
  allowedRoleKeys: true,
  guards: true,
  effects: true,
  notifyEvent: true,
  slaBehavior: true,
  priority: true,
  isActive: true,
  fromStage: { select: { code: true, name: true } },
  toStage: { select: { code: true, name: true } },
  action: { select: { id: true, code: true, label: true, kind: true } },
} as const;

const WORKFLOW_SELECT = {
  id: true,
  code: true,
  name: true,
  version: true,
  isPublished: true,
  publishedAt: true,
  description: true,
  stages: { select: STAGE_SELECT, orderBy: { sequence: 'asc' as const } },
  transitions: { select: TRANSITION_SELECT },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Read
// ═══════════════════════════════════════════════════════════════════════════

export async function listWorkflows() {
  return prisma.workflow.findMany({
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
    select: WORKFLOW_SELECT,
  });
}

export async function getWorkflow(id: string) {
  const wf = await prisma.workflow.findUnique({ where: { id }, select: WORKFLOW_SELECT });
  if (!wf) throw notFound('Workflow not found.');
  return wf;
}

/** Returns the unpublished draft for a workflow code, or null. */
export async function getDraft(code: string) {
  return prisma.workflow.findFirst({
    where: { code, isPublished: false },
    select: WORKFLOW_SELECT,
    orderBy: { version: 'desc' },
  });
}

/** Returns the published version for a workflow code, or null. */
export async function getPublished(code: string) {
  return prisma.workflow.findFirst({
    where: { code, isPublished: true },
    select: WORKFLOW_SELECT,
    orderBy: { version: 'desc' },
  });
}

export async function listWorkflowActions() {
  return prisma.workflowAction.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, code: true, label: true, kind: true, intent: true, capabilityKey: true, requiresRemarks: true, requiresAttachment: true },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Draft management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a new draft.
 *  - If a published version exists for the code, it is deep-cloned as version+1.
 *  - If no published version exists, a blank draft is created.
 *  - Cannot create a draft when one already exists.
 */
export async function createDraft(code: string, actor: AuthUser, meta: Meta = {}) {
  const existing = await prisma.workflow.findFirst({ where: { code, isPublished: false } });
  if (existing) throw conflict(`A draft for workflow "${code}" already exists. Publish or discard it first.`);

  const published = await prisma.workflow.findFirst({
    where: { code, isPublished: true },
    orderBy: { version: 'desc' },
    select: WORKFLOW_SELECT,
  });

  return prisma.$transaction(async (tx) => {
    const nextVersion = published ? published.version + 1 : 1;
    const draft = await tx.workflow.create({
      data: {
        code,
        name: published?.name ?? code,
        version: nextVersion,
        description: published?.description ?? '',
        isPublished: false,
      },
    });

    if (published) {
      // Deep clone stages
      const stageIdMap = new Map<string, string>();
      for (const stage of published.stages) {
        const created = await tx.workflowStage.create({
          data: {
            workflowId: draft.id,
            code: stage.code,
            name: stage.name,
            type: stage.type,
            sequence: stage.sequence,
            ownerRoleKeys: stage.ownerRoleKeys as object,
            entryStatus: stage.entryStatus,
            workingStatus: stage.workingStatus ?? null,
            slaDays: stage.slaDays,
            isEntry: stage.isEntry,
            isTerminal: stage.isTerminal,
            allowReassign: stage.allowReassign,
            description: stage.description,
            isActive: stage.isActive,
          },
        });
        stageIdMap.set(stage.id, created.id);
      }

      // Deep clone transitions with remapped stage IDs
      for (const t of published.transitions) {
        const newFromStageId = stageIdMap.get(t.fromStageId);
        const newToStageId = t.toStageId ? stageIdMap.get(t.toStageId) : null;
        if (!newFromStageId) continue;

        await tx.workflowTransition.create({
          data: {
            workflowId: draft.id,
            fromStageId: newFromStageId,
            actionId: t.actionId,
            fromStatus: t.fromStatus ?? null,
            toStageId: newToStageId ?? null,
            toStatus: t.toStatus,
            allowedRoleKeys: t.allowedRoleKeys as object,
            guards: t.guards as object,
            effects: t.effects as object,
            notifyEvent: t.notifyEvent,
            slaBehavior: t.slaBehavior,
            priority: t.priority,
            isActive: t.isActive,
          },
        });
      }
    }

    await audit(tx, { actor, action: 'WORKFLOW_DRAFT_CREATED', entityType: 'Workflow', entityId: draft.id, after: { code, version: nextVersion }, ...meta });
    return tx.workflow.findUniqueOrThrow({ where: { id: draft.id }, select: WORKFLOW_SELECT });
  });
}

export async function discardDraft(draftId: string, actor: AuthUser, meta: Meta = {}) {
  const draft = await prisma.workflow.findUnique({ where: { id: draftId } });
  if (!draft) throw notFound('Draft not found.');
  if (draft.isPublished) throw businessRule('Cannot discard a published workflow.');

  return prisma.$transaction(async (tx) => {
    await tx.workflow.delete({ where: { id: draftId } });
    await audit(tx, { actor, action: 'WORKFLOW_DRAFT_DISCARDED', entityType: 'Workflow', entityId: draftId, ...meta });
    return { ok: true };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage editing (on draft only)
// ═══════════════════════════════════════════════════════════════════════════

async function requireDraft(workflowId: string) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) throw notFound('Workflow not found.');
  if (wf.isPublished) throw businessRule('Cannot modify a published workflow. Create a new draft.');
  return wf;
}

export async function addStage(
  workflowId: string,
  input: {
    code: string; name: string; type?: string; sequence: number;
    ownerRoleKeys: string[]; entryStatus: string; workingStatus?: string | null;
    slaDays?: number; isEntry?: boolean; isTerminal?: boolean; allowReassign?: boolean; description?: string;
  },
  actor: AuthUser,
  meta: Meta = {}
) {
  await requireDraft(workflowId);

  const clash = await prisma.workflowStage.findUnique({ where: { workflowId_code: { workflowId, code: input.code } } });
  if (clash) throw conflict(`Stage code "${input.code}" already exists in this workflow.`);

  return prisma.$transaction(async (tx) => {
    const stage = await tx.workflowStage.create({
      data: {
        workflowId,
        code: input.code.toUpperCase(),
        name: input.name,
        type: input.type ?? 'REVIEW',
        sequence: input.sequence,
        ownerRoleKeys: input.ownerRoleKeys,
        entryStatus: input.entryStatus,
        workingStatus: input.workingStatus ?? null,
        slaDays: input.slaDays ?? 0,
        isEntry: input.isEntry ?? false,
        isTerminal: input.isTerminal ?? false,
        allowReassign: input.allowReassign ?? true,
        description: input.description ?? '',
        isActive: true,
      },
      select: STAGE_SELECT,
    });
    await audit(tx, { actor, action: 'WORKFLOW_DRAFT_STAGE_ADDED', entityType: 'WorkflowStage', entityId: stage.id, after: { code: stage.code, name: stage.name }, ...meta });
    return stage;
  });
}

export async function updateStage(
  stageId: string,
  input: Partial<{
    name: string; type: string; sequence: number; ownerRoleKeys: string[];
    entryStatus: string; workingStatus: string | null; slaDays: number;
    isEntry: boolean; isTerminal: boolean; allowReassign: boolean; description: string; isActive: boolean;
  }>,
  actor: AuthUser,
  meta: Meta = {}
) {
  const stage = await prisma.workflowStage.findUnique({ where: { id: stageId }, select: { ...STAGE_SELECT, workflowId: true } });
  if (!stage) throw notFound('Stage not found.');
  await requireDraft(stage.workflowId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workflowStage.update({
      where: { id: stageId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
        ...(input.ownerRoleKeys ? { ownerRoleKeys: input.ownerRoleKeys } : {}),
        ...(input.entryStatus ? { entryStatus: input.entryStatus } : {}),
        ...(input.workingStatus !== undefined ? { workingStatus: input.workingStatus } : {}),
        ...(input.slaDays !== undefined ? { slaDays: input.slaDays } : {}),
        ...(input.isEntry !== undefined ? { isEntry: input.isEntry } : {}),
        ...(input.isTerminal !== undefined ? { isTerminal: input.isTerminal } : {}),
        ...(input.allowReassign !== undefined ? { allowReassign: input.allowReassign } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: STAGE_SELECT,
    });
    await audit(tx, { actor, action: 'WORKFLOW_DRAFT_STAGE_UPDATED', entityType: 'WorkflowStage', entityId: stageId, before: { name: stage.name }, after: { name: updated.name }, ...meta });
    return updated;
  });
}

export async function removeStage(stageId: string, actor: AuthUser, meta: Meta = {}) {
  const stage = await prisma.workflowStage.findUnique({
    where: { id: stageId },
    select: { ...STAGE_SELECT, workflowId: true },
  });
  if (!stage) throw notFound('Stage not found.');
  await requireDraft(stage.workflowId);

  // Cannot remove a stage that has transitions
  const transCount = await prisma.workflowTransition.count({
    where: { OR: [{ fromStageId: stageId }, { toStageId: stageId }] },
  });
  if (transCount > 0) throw businessRule(`Cannot remove stage: ${transCount} transition(s) reference it. Remove transitions first.`);

  return prisma.$transaction(async (tx) => {
    await tx.workflowStage.delete({ where: { id: stageId } });
    await audit(tx, { actor, action: 'WORKFLOW_DRAFT_STAGE_REMOVED', entityType: 'WorkflowStage', entityId: stageId, before: { code: stage.code, name: stage.name }, ...meta });
    return { ok: true };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Transition editing (on draft only)
// ═══════════════════════════════════════════════════════════════════════════

export async function addTransition(
  workflowId: string,
  input: {
    fromStageId: string; actionId: string; fromStatus?: string | null;
    toStageId?: string | null; toStatus: string;
    allowedRoleKeys?: string[]; guards?: unknown; effects?: unknown;
    notifyEvent?: string; slaBehavior?: string; priority?: number;
  },
  actor: AuthUser,
  meta: Meta = {}
) {
  await requireDraft(workflowId);

  return prisma.$transaction(async (tx) => {
    const transition = await tx.workflowTransition.create({
      data: {
        workflowId,
        fromStageId: input.fromStageId,
        actionId: input.actionId,
        fromStatus: input.fromStatus ?? null,
        toStageId: input.toStageId ?? null,
        toStatus: input.toStatus,
        allowedRoleKeys: (input.allowedRoleKeys ?? []) as unknown as object,
        guards: (input.guards ?? []) as unknown as object,
        effects: (input.effects ?? []) as unknown as object,
        notifyEvent: input.notifyEvent ?? '',
        slaBehavior: input.slaBehavior ?? 'NONE',
        priority: input.priority ?? 0,
        isActive: true,
      },
      select: TRANSITION_SELECT,
    });
    await audit(tx, { actor, action: 'WORKFLOW_DRAFT_TRANSITION_ADDED', entityType: 'WorkflowTransition', entityId: transition.id, ...meta });
    return transition;
  });
}

export async function removeTransition(transitionId: string, actor: AuthUser, meta: Meta = {}) {
  const transition = await prisma.workflowTransition.findUnique({
    where: { id: transitionId },
    select: { id: true, workflowId: true },
  });
  if (!transition) throw notFound('Transition not found.');
  await requireDraft(transition.workflowId);

  return prisma.$transaction(async (tx) => {
    await tx.workflowTransition.delete({ where: { id: transitionId } });
    await audit(tx, { actor, action: 'WORKFLOW_DRAFT_TRANSITION_REMOVED', entityType: 'WorkflowTransition', entityId: transitionId, ...meta });
    return { ok: true };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation + Publishing
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationError = { code: string; message: string };

export function validateWorkflowDraft(draft: Awaited<ReturnType<typeof getWorkflow>>): ValidationError[] {
  const errors: ValidationError[] = [];
  const stages = draft.stages.filter((s) => s.isActive);
  const transitions = draft.transitions.filter((t) => t.isActive);

  if (stages.length === 0) {
    errors.push({ code: 'NO_STAGES', message: 'The workflow has no active stages.' });
    return errors; // No point continuing
  }

  const entryStages = stages.filter((s) => s.isEntry);
  if (entryStages.length === 0) errors.push({ code: 'NO_ENTRY', message: 'No stage is marked as an entry point.' });
  if (entryStages.length > 1) errors.push({ code: 'MULTIPLE_ENTRY', message: 'More than one stage is marked as the entry point.' });

  const terminalStages = stages.filter((s) => s.isTerminal);
  if (terminalStages.length === 0) errors.push({ code: 'NO_TERMINAL', message: 'No stage is marked as a terminal (end) stage.' });

  // Reachability check: BFS from entry
  const entryStage = entryStages[0];
  if (entryStage) {
    const reachable = new Set<string>([entryStage.id]);
    const queue = [entryStage.id];
    while (queue.length) {
      const current = queue.shift()!;
      for (const t of transitions) {
        if (t.fromStageId === current && t.toStageId && !reachable.has(t.toStageId)) {
          reachable.add(t.toStageId);
          queue.push(t.toStageId);
        }
      }
    }
    for (const stage of stages) {
      if (!reachable.has(stage.id) && !stage.isEntry) {
        errors.push({ code: 'UNREACHABLE_STAGE', message: `Stage "${stage.name}" (${stage.code}) is not reachable from the entry point.` });
      }
    }
  }

  // Each non-terminal stage must have at least one outbound transition
  const stageIds = new Set(stages.map((s) => s.id));
  const hasOutbound = new Set(transitions.filter((t) => stageIds.has(t.fromStageId)).map((t) => t.fromStageId));
  for (const stage of stages) {
    if (!stage.isTerminal && !hasOutbound.has(stage.id)) {
      errors.push({ code: 'DEAD_END_STAGE', message: `Stage "${stage.name}" (${stage.code}) has no outbound transitions and is not a terminal stage.` });
    }
  }

  return errors;
}

export async function publishDraft(draftId: string, actor: AuthUser, meta: Meta = {}) {
  const draft = await getWorkflow(draftId);
  if (draft.isPublished) throw businessRule('This workflow is already published.');

  const errors = validateWorkflowDraft(draft);
  if (errors.length > 0) {
    throw badRequest(
      `Cannot publish: ${errors.length} validation error(s). Fix them and try again.`,
      errors.map((e) => ({ path: e.code, message: e.message }))
    );
  }

  return prisma.$transaction(async (tx) => {
    const published = await tx.workflow.update({
      where: { id: draftId },
      data: { isPublished: true, publishedAt: new Date() },
      select: { id: true, code: true, version: true },
    });
    await audit(tx, { actor, action: 'WORKFLOW_PUBLISHED', entityType: 'Workflow', entityId: draftId, after: published, ...meta });
    return published;
  });
}
