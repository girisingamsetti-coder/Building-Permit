import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { can, isSystemAdmin, type AuthUser } from '@/server/auth/context';
import { taskScope } from '@/server/auth/scope';
import { audit } from '@/server/services/audit';
import { emit, EVENTS } from '@/server/events/outbox';
import { conflict, forbidden, notFound } from '@/server/http/errors';
import { CAPABILITIES, CLOSED_SHORTFALL_STATUSES } from '@/lib/constants';
import { TASK_FILTERS, type TaskFilter } from '@/lib/workflow';

/**
 * The officer's inbox.
 *
 * ── One queue, every desk ────────────────────────────────────────────────
 *
 * There is no TPA inbox and no Commissioner inbox — there is one query, and
 * what an officer sees is decided by the tasks addressed to the roles they
 * hold. Adding a stage adds rows to this table; it does not add a page. That
 * is the same principle as the engine's: the departments differ in
 * configuration, not in code.
 *
 * ── Claiming is coordination, not authorisation ──────────────────────────
 *
 * A task addressed to a role sits in a shared inbox. Claiming it says "I am
 * working on this" so two officers do not review the same file in parallel; it
 * is not what grants the right to act, which comes from the role and the
 * capability. An unclaimed task can still be acted on by anyone holding the
 * role — the engine only refuses when somebody ELSE has claimed it, which is
 * the case where a collision would actually waste someone's afternoon.
 */

const TASK_SELECT = {
  id: true,
  status: true,
  assignedRoleKey: true,
  assignedUserId: true,
  zoneId: true,
  priority: true,
  receivedAt: true,
  claimedAt: true,
  assignee: { select: { id: true, name: true } },
  stage: { select: { id: true, code: true, name: true, ownerRoleKeys: true, allowReassign: true } },
  sla: { select: { dueAt: true, status: true, overdueDays: true } },
  instance: {
    select: {
      id: true,
      status: true,
      parkedStageId: true,
      application: {
        select: {
          id: true,
          applicationNumber: true,
          status: true,
          openShortfalls: true,
          submittedAt: true,
          zone: { select: { code: true, name: true } },
          applicationType: { select: { code: true, name: true } },
          applicant: { select: { name: true, phone: true } },
          property: { select: { localityName: true, district: true } },
        },
      },
    },
  },
} satisfies Prisma.WorkflowTaskSelect;

type TaskRow = Prisma.WorkflowTaskGetPayload<{ select: typeof TASK_SELECT }>;

export type TaskListQuery = {
  filter?: string;
  q?: string;
  stage?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
};

export type TaskRowView = {
  id: string;
  applicationId: string;
  applicationNumber: string;
  applicationType: string;
  applicantName: string;
  property: string;
  zone: string;
  stageCode: string;
  stageName: string;
  status: string;
  receivedAt: Date;
  daysPending: number;
  dueAt: Date | null;
  slaStatus: string | null;
  priority: number;
  openShortfalls: number;
  claimedById: string | null;
  claimedByName: string;
  /** True when this user holds the task personally. */
  mine: boolean;
  /** True when nobody has claimed it. */
  unclaimed: boolean;
};

const DAY_MS = 86_400_000;

/**
 * The filters, as WHERE fragments.
 *
 * Each is a question an officer actually asks at the start of the day. "New"
 * is what nobody has picked up; "In progress" is what somebody has. "Due soon"
 * and "Overdue" read the SLA row rather than recomputing dates in the
 * application, so the queue and the sweep can never disagree about which files
 * are late.
 */
function filterWhere(filter: TaskFilter): Prisma.WorkflowTaskWhereInput {
  switch (filter) {
    case TASK_FILTERS.NEW:
      return { status: 'PENDING', assignedUserId: null };
    case TASK_FILTERS.PENDING:
      return { OR: [{ status: 'IN_PROGRESS' }, { assignedUserId: { not: null } }] };
    case TASK_FILTERS.DUE_SOON:
      return { sla: { status: 'DUE_SOON' } };
    case TASK_FILTERS.OVERDUE:
      return { sla: { status: 'OVERDUE' } };
    case TASK_FILTERS.SHORTFALL:
      return {
        instance: {
          application: {
            shortfalls: { some: { status: { notIn: [...CLOSED_SHORTFALL_STATUSES] } } },
          },
        },
      };
    default:
      return {};
  }
}

function orderBy(query: TaskListQuery): Prisma.WorkflowTaskOrderByWithRelationInput[] {
  const dir = query.dir === 'asc' ? 'asc' : 'desc';

  switch (query.sort) {
    case 'received':
      return [{ receivedAt: dir }];
    case 'due':
      // Nulls last: a task with no SLA is not "the most urgent thing on the
      // list" merely because it has no date.
      return [{ sla: { dueAt: dir } }, { receivedAt: 'asc' }];
    case 'priority':
      return [{ priority: dir }, { receivedAt: 'asc' }];
    case 'application':
      return [{ instance: { application: { applicationNumber: dir } } }];
    default:
      // The default is the one that matters: most urgent first, and among
      // equals the file that has waited longest. An officer working top-down
      // is then working in the right order without sorting anything.
      return [{ priority: 'desc' }, { receivedAt: 'asc' }];
  }
}

export async function listTasks(user: AuthUser, query: TaskListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 20));
  const filter = (query.filter ?? TASK_FILTERS.ALL) as TaskFilter;

  const where: Prisma.WorkflowTaskWhereInput = {
    AND: [
      { status: { in: ['PENDING', 'IN_PROGRESS'] } },
      taskScope(user),
      filterWhere(filter),
      ...(query.stage ? [{ stage: { code: query.stage } }] : []),
      ...(query.q
        ? [
            {
              instance: {
                application: {
                  OR: [
                    { applicationNumber: { contains: query.q } },
                    { applicant: { name: { contains: query.q } } },
                  ],
                },
              },
            },
          ]
        : []),
    ],
  };

  const [rows, total, counts] = await Promise.all([
    prisma.workflowTask.findMany({
      where,
      select: TASK_SELECT,
      orderBy: orderBy(query),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.workflowTask.count({ where }),
    countByFilter(user, query),
  ]);

  return {
    rows: rows.map((row) => shapeTask(row, user)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  };
}

/**
 * The number on each filter chip.
 *
 * Counted with the same scope and the same fragments the list uses, so a chip
 * reading "4" and a list showing three rows is not a state this can produce.
 */
async function countByFilter(user: AuthUser, query: TaskListQuery): Promise<Record<string, number>> {
  const base: Prisma.WorkflowTaskWhereInput[] = [
    { status: { in: ['PENDING', 'IN_PROGRESS'] } },
    taskScope(user),
    ...(query.stage ? [{ stage: { code: query.stage } }] : []),
  ];

  const keys = Object.values(TASK_FILTERS);
  const results = await Promise.all(
    keys.map((key) => prisma.workflowTask.count({ where: { AND: [...base, filterWhere(key)] } }))
  );

  return Object.fromEntries(keys.map((key, i) => [key, results[i]!]));
}

function shapeTask(row: TaskRow, user: AuthUser): TaskRowView {
  const app = row.instance.application;

  return {
    id: row.id,
    applicationId: app.id,
    applicationNumber: app.applicationNumber,
    applicationType: app.applicationType.name,
    applicantName: app.applicant?.name ?? '—',
    property: [app.property?.localityName, app.property?.district].filter(Boolean).join(', ') || '—',
    zone: app.zone?.name ?? '—',
    stageCode: row.stage.code,
    stageName: row.stage.name,
    status: app.status,
    receivedAt: row.receivedAt,
    daysPending: Math.max(0, Math.floor((Date.now() - row.receivedAt.getTime()) / DAY_MS)),
    dueAt: row.sla?.dueAt ?? null,
    slaStatus: row.sla?.status ?? null,
    priority: row.priority,
    openShortfalls: app.openShortfalls,
    claimedById: row.assignedUserId,
    claimedByName: row.assignee?.name ?? '',
    mine: row.assignedUserId === user.id,
    unclaimed: row.assignedUserId === null,
  };
}

/** The counts behind an officer's dashboard tile. */
export async function taskSummary(user: AuthUser) {
  const base: Prisma.WorkflowTaskWhereInput[] = [
    { status: { in: ['PENDING', 'IN_PROGRESS'] } },
    taskScope(user),
  ];

  const [total, mine, unclaimed, dueSoon, overdue] = await Promise.all([
    prisma.workflowTask.count({ where: { AND: base } }),
    prisma.workflowTask.count({ where: { AND: [...base, { assignedUserId: user.id }] } }),
    prisma.workflowTask.count({ where: { AND: [...base, { assignedUserId: null }] } }),
    prisma.workflowTask.count({ where: { AND: [...base, { sla: { status: 'DUE_SOON' } }] } }),
    prisma.workflowTask.count({ where: { AND: [...base, { sla: { status: 'OVERDUE' } }] } }),
  ]);

  return { total, mine, unclaimed, dueSoon, overdue };
}

// ═══════════════════════════════════════════════════════════════════════════
// Claim · release · reassign
// ═══════════════════════════════════════════════════════════════════════════

type Meta = { ip: string; userAgent: string; correlationId?: string };

async function requireTask(user: AuthUser, taskId: string) {
  const task = await prisma.workflowTask.findFirst({
    where: { AND: [{ id: taskId }, taskScope(user)] },
    select: {
      id: true,
      status: true,
      assignedUserId: true,
      assignedRoleKey: true,
      assignee: { select: { name: true } },
      stage: { select: { id: true, code: true, name: true, ownerRoleKeys: true, allowReassign: true } },
      instance: {
        select: { id: true, application: { select: { id: true, applicationNumber: true } } },
      },
    },
  });

  // Same answer for "not yours" and "not there": a task id is a guessable
  // handle on somebody else's file, and distinguishing the two would confirm
  // which files exist.
  if (!task) throw notFound('That task could not be found.');
  return task;
}

/**
 * Takes a task off the shared queue.
 *
 * A conditional update, not a read-then-write: `updateMany` with the current
 * holder in its WHERE means two officers pressing Claim in the same second
 * produce one winner and one clear refusal, decided by the database rather
 * than by whichever request happened to read first.
 */
export async function claimTask(user: AuthUser, taskId: string, meta: Meta) {
  const task = await requireTask(user, taskId);

  const ownerRoles = Array.isArray(task.stage.ownerRoleKeys) ? (task.stage.ownerRoleKeys as string[]) : [];
  if (!ownerRoles.some((role) => user.roleKeys.includes(role as never))) {
    throw forbidden(`${task.stage.name} is not one of your desks.`);
  }

  if (task.assignedUserId === user.id) {
    return { taskId: task.id, claimed: true, message: 'You already hold this file.' };
  }

  const now = new Date();

  const claimed = await prisma.workflowTask.updateMany({
    where: { id: task.id, status: { in: ['PENDING', 'IN_PROGRESS'] }, assignedUserId: null },
    data: { assignedUserId: user.id, claimedAt: now, status: 'IN_PROGRESS' },
  });

  if (claimed.count === 0) {
    throw conflict(
      task.assignee?.name
        ? `${task.assignee.name} took this file first.`
        : 'Somebody else took this file first.'
    );
  }

  await audit(prisma, {
    actor: user,
    action: 'WORKFLOW_TASK_CLAIMED',
    entityType: 'WorkflowTask',
    entityId: task.id,
    applicationId: task.instance.application.id,
    after: { stageCode: task.stage.code, assignedUserId: user.id },
    ...meta,
  });

  return { taskId: task.id, claimed: true, message: 'This file is now yours.' };
}

/** Puts a claimed task back on the shared queue. */
export async function releaseTask(user: AuthUser, taskId: string, meta: Meta) {
  const task = await requireTask(user, taskId);

  const isHolder = task.assignedUserId === user.id;
  if (!isHolder && !can(user, CAPABILITIES.WORKFLOW_REASSIGN)) {
    throw forbidden('Only the officer holding a file, or a supervisor, can release it.');
  }

  const released = await prisma.workflowTask.updateMany({
    where: { id: task.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    data: { assignedUserId: null, claimedAt: null, status: 'PENDING' },
  });

  if (released.count === 0) throw conflict('This file has already moved on.');

  await audit(prisma, {
    actor: user,
    action: 'WORKFLOW_TASK_RELEASED',
    entityType: 'WorkflowTask',
    entityId: task.id,
    applicationId: task.instance.application.id,
    before: { assignedUserId: task.assignedUserId },
    after: { assignedUserId: null, releasedBySupervisor: !isHolder },
    ...meta,
  });

  return { taskId: task.id, claimed: false, message: 'The file is back on the queue.' };
}

/**
 * Moves a task to a named officer.
 *
 * The target must hold a role the STAGE owns — not merely any departmental
 * role. Reassigning a Commissioner's file to a TPA would put it in an inbox
 * where nobody can act on it, and the file would simply stop.
 */
export async function reassignTask(
  user: AuthUser,
  taskId: string,
  input: { userId: string; reason?: string },
  meta: Meta
) {
  const task = await requireTask(user, taskId);

  if (!can(user, CAPABILITIES.WORKFLOW_REASSIGN) && !isSystemAdmin(user)) {
    throw forbidden('Your role does not permit reassigning work.');
  }

  if (!task.stage.allowReassign) {
    throw conflict(`Files at ${task.stage.name} cannot be reassigned.`);
  }

  const targetRoles = Array.isArray(task.stage.ownerRoleKeys) ? (task.stage.ownerRoleKeys as string[]) : [];
  const target = await prisma.user.findFirst({
    where: {
      id: input.userId,
      status: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: { key: { in: targetRoles } } } },
    },
    select: { id: true, name: true, roles: { select: { role: { select: { key: true } } } } },
  });

  if (!target) {
    throw conflict(`That officer does not hold a role that works at ${task.stage.name}.`);
  }

  const now = new Date();
  const roleKey =
    target.roles.map((r) => r.role.key).find((key) => targetRoles.includes(key)) ??
    task.assignedRoleKey;

  const moved = await prisma.workflowTask.updateMany({
    where: { id: task.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    data: {
      assignedUserId: target.id,
      assignedRoleKey: roleKey,
      claimedAt: now,
      status: 'IN_PROGRESS',
    },
  });

  if (moved.count === 0) throw conflict('This file has already moved on.');

  await audit(prisma, {
    actor: user,
    action: 'WORKFLOW_TASK_REASSIGNED',
    entityType: 'WorkflowTask',
    entityId: task.id,
    applicationId: task.instance.application.id,
    before: { assignedUserId: task.assignedUserId, assignedRoleKey: task.assignedRoleKey },
    after: { assignedUserId: target.id, assignedRoleKey: roleKey },
    remarks: input.reason ?? '',
    ...meta,
  });

  await prisma.$transaction((tx) =>
    emit(tx, {
      eventCode: EVENTS.TASK_ASSIGNED,
      applicationId: task.instance.application.id,
      payload: {
        applicationNumber: task.instance.application.applicationNumber,
        taskId: task.id,
        stageCode: task.stage.code,
        stageName: task.stage.name,
        assignedUserId: target.id,
        assignedRoleKey: roleKey,
        reassignedBy: user.name,
      },
    })
  );

  return {
    taskId: task.id,
    claimed: true,
    message: `Reassigned to ${target.name}.`,
  };
}

/** Officers a task may be reassigned to — the reassignment dialog's options. */
export async function reassignCandidates(user: AuthUser, taskId: string) {
  const task = await requireTask(user, taskId);

  const candidateRoles = Array.isArray(task.stage.ownerRoleKeys) ? (task.stage.ownerRoleKeys as string[]) : [];
  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: { key: { in: candidateRoles } } } },
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      designation: true,
      _count: { select: { tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    designation: u.designation,
    // Shown in the picker: reassigning to the person with nineteen open files
    // is a decision somebody should make knowingly.
    openTasks: u._count.tasks,
  }));
}
