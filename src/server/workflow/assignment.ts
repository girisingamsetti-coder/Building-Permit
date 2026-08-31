import 'server-only';
import type { Tx } from '@/server/db/prisma';

/**
 * WHO the next task goes to.
 *
 * The engine asks this question and never answers it itself, which is the
 * point: "the TPA desk in Zone 2 is one named officer, and the Commissioner's
 * files are urgent" is a row in `workflow_assignments`, not a branch in
 * `engine.ts`. An unconfigured stage still routes — to the shared inbox of its
 * first owner role — so adding a stage does not require remembering to add a
 * rule as well.
 *
 * ── Why ROLE_QUEUE is the default ────────────────────────────────────────
 *
 * A task addressed to a PERSON is a task that stops moving when that person is
 * on leave. Addressed to a ROLE, it sits in a shared inbox where anyone
 * holding the role can pick it up, and claiming it is what makes it theirs.
 * Naming a person up front is available (DIRECT) because some desks really are
 * one person — but it is a decision an administrator makes deliberately,
 * rather than the behaviour they get by accident.
 */

export type StageForAssignment = {
  id: string;
  code: string;
  ownerRoleKeys: string[];
};

export type Assignment = {
  roleKey: string;
  userId: string | null;
  zoneId: string | null;
  priority: number;
  /** Which rule decided this, for the audit payload. Empty when defaulted. */
  ruleId: string;
  strategy: 'ROLE_QUEUE' | 'DIRECT' | 'LEAST_LOADED' | 'ROUND_ROBIN';
};

export async function resolveAssignment(
  tx: Tx,
  stage: StageForAssignment,
  application: { zoneId: string | null }
): Promise<Assignment> {
  const fallback: Assignment = {
    roleKey: stage.ownerRoleKeys[0] ?? '',
    userId: null,
    zoneId: application.zoneId,
    priority: 0,
    ruleId: '',
    strategy: 'ROLE_QUEUE',
  };

  // A terminal stage has no owner and takes no task. The engine checks that
  // before calling, but a stage misconfigured with no owner role must not
  // produce a task addressed to the empty string.
  if (!fallback.roleKey) return fallback;

  const rules = await tx.workflowAssignment.findMany({
    where: {
      stageId: stage.id,
      isActive: true,
      OR: [{ zoneId: null }, ...(application.zoneId ? [{ zoneId: application.zoneId }] : [])],
    },
    // A rule naming this zone outranks the catch-all. `nulls: 'last'` is what
    // expresses "most specific wins" — without it the ordering of a nullable
    // column is unspecified and the winner would vary between queries.
    orderBy: [{ zoneId: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }],
  });

  // A rule may only address a role the stage actually owns. The publish-time
  // validator enforces this, but a rule written before an owner list was
  // narrowed would otherwise route a file to a desk that no longer exists.
  const rule = rules.find((r) => stage.ownerRoleKeys.includes(r.roleKey));
  if (!rule) return fallback;

  const base: Assignment = {
    roleKey: rule.roleKey,
    userId: null,
    zoneId: application.zoneId,
    priority: rule.priority,
    ruleId: rule.id,
    strategy: rule.strategy,
  };

  if (rule.strategy === 'DIRECT') {
    // The CHECK constraint guarantees userId is present for DIRECT. Verifying
    // the account is still usable is a different question, and one worth
    // asking: routing to a suspended officer is how a file disappears.
    const user = rule.userId
      ? await tx.user.findFirst({
          where: { id: rule.userId, status: 'ACTIVE', deletedAt: null },
          select: { id: true },
        })
      : null;

    return { ...base, userId: user?.id ?? null };
  }

  if (rule.strategy === 'LEAST_LOADED' || rule.strategy === 'ROUND_ROBIN') {
    const userId = await pickOfficer(tx, rule.roleKey, application.zoneId, rule.strategy);
    return { ...base, userId };
  }

  return base;
}

/**
 * Chooses among the officers who hold the role in this zone.
 *
 * LEAST_LOADED counts open tasks; ROUND_ROBIN takes whoever has waited longest
 * since their last assignment. Both fall back to the shared inbox when nobody
 * qualifies — an empty rota must leave the file claimable, not assign it to
 * nobody and make it invisible.
 */
async function pickOfficer(
  tx: Tx,
  roleKey: string,
  zoneId: string | null,
  strategy: 'LEAST_LOADED' | 'ROUND_ROBIN'
): Promise<string | null> {
  const candidates = await tx.user.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: { key: roleKey } } },
      ...(zoneId
        ? { OR: [{ primaryZoneId: zoneId }, { jurisdictions: { some: { zoneId } } }] }
        : {}),
    },
    select: { id: true },
  });

  if (!candidates.length) return null;

  const ids = candidates.map((c) => c.id);

  if (strategy === 'LEAST_LOADED') {
    const load = await tx.workflowTask.groupBy({
      by: ['assignedUserId'],
      where: { assignedUserId: { in: ids }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      _count: { _all: true },
    });

    const counts = new Map(load.map((row) => [row.assignedUserId as string, row._count._all]));
    // Ties break on the candidate order, which is stable — an officer with no
    // open tasks at all is not in `counts` and therefore counts as zero.
    return ids.reduce((best, id) => ((counts.get(id) ?? 0) < (counts.get(best) ?? 0) ? id : best), ids[0]!);
  }

  const lastAssigned = await tx.workflowTask.groupBy({
    by: ['assignedUserId'],
    where: { assignedUserId: { in: ids } },
    _max: { receivedAt: true },
  });

  const last = new Map(lastAssigned.map((row) => [row.assignedUserId as string, row._max.receivedAt]));
  return ids.reduce((best, id) => {
    const a = last.get(id)?.getTime() ?? 0;
    const b = last.get(best)?.getTime() ?? 0;
    return a < b ? id : best;
  }, ids[0]!);
}
