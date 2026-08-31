import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { applicationScope } from '@/server/auth/scope';
import { isLtp, type AuthUser } from '@/server/auth/context';
import { notFound } from '@/server/http/errors';
import { isUuid } from '@/lib/utils';
import {
  CLOSED_SHORTFALL_STATUSES,
  SHORTFALL_FILTERS,
  SHORTFALL_STATUS,
  turnOf,
  type ShortfallFilter,
} from '@/lib/shortfalls';
import { SHORTFALL_SELECT, type ShortfallRow } from './engine';

/**
 * Reading shortfalls — the register, and one file's worth.
 *
 * ── Scope is merged into the query, never applied after ──────────────────
 *
 * A shortfall belongs to an application, and who may see an application is
 * already decided by `applicationScope`. Reusing it means a shortfall cannot
 * be visible to somebody the application is not — including through the
 * cross-application register, which is exactly where such a leak would be
 * least obvious.
 */

const LIST_SELECT = {
  ...SHORTFALL_SELECT,
  application: {
    select: {
      id: true,
      applicationNumber: true,
      status: true,
      currentStageCode: true,
      zone: { select: { name: true } },
      applicant: { select: { name: true } },
      applicationType: { select: { name: true } },
    },
  },
  raisedBy: { select: { id: true, name: true } },
} satisfies Prisma.ShortfallSelect;

type ListRow = Prisma.ShortfallGetPayload<{ select: typeof LIST_SELECT }>;

export type ShortfallListQuery = {
  filter?: string;
  kind?: string;
  q?: string;
  applicationId?: string;
  page?: number;
  pageSize?: number;
};

/** The WHERE fragment behind each filter chip. */
function filterWhere(filter: ShortfallFilter): Prisma.ShortfallWhereInput {
  switch (filter) {
    case SHORTFALL_FILTERS.OPEN:
      return { status: { notIn: [...CLOSED_SHORTFALL_STATUSES] } };

    case SHORTFALL_FILTERS.AWAITING_APPLICANT:
      return {
        status: {
          in: [
            SHORTFALL_STATUS.RAISED,
            SHORTFALL_STATUS.NOTIFIED,
            SHORTFALL_STATUS.ACTION_REQUIRED,
            SHORTFALL_STATUS.RESOLUTION_REJECTED,
          ],
        },
      };

    case SHORTFALL_FILTERS.AWAITING_OFFICER:
      return {
        status: { in: [SHORTFALL_STATUS.RESOLUTION_SUBMITTED, SHORTFALL_STATUS.UNDER_REVIEW] },
      };

    case SHORTFALL_FILTERS.OVERDUE:
      return {
        status: { notIn: [...CLOSED_SHORTFALL_STATUSES] },
        dueDate: { lt: new Date() },
      };

    case SHORTFALL_FILTERS.RESOLVED:
      return { status: { in: [...CLOSED_SHORTFALL_STATUSES] } };

    default:
      return {};
  }
}

export type ShortfallListRow = ReturnType<typeof shapeListRow>;

export async function listShortfalls(user: AuthUser, query: ShortfallListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 20));
  const filter = (query.filter ?? SHORTFALL_FILTERS.ALL) as ShortfallFilter;

  const where: Prisma.ShortfallWhereInput = {
    AND: [
      { application: { deletedAt: null, ...applicationScope(user) } },
      filterWhere(filter),
      ...(query.kind ? [{ kind: query.kind as never }] : []),
      ...(query.applicationId ? [{ applicationId: query.applicationId }] : []),
      ...(query.q
        ? [
            {
              OR: [
                { shortfallNumber: { contains: query.q, mode: 'insensitive' as const } },
                { title: { contains: query.q, mode: 'insensitive' as const } },
                {
                  application: {
                    applicationNumber: { contains: query.q, mode: 'insensitive' as const },
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };

  const [rows, total, counts] = await Promise.all([
    prisma.shortfall.findMany({
      where,
      select: LIST_SELECT,
      // Open first, then oldest first: the one that has been waiting longest
      // is the one somebody should look at, and a settled shortfall is history.
      orderBy: [{ closedAt: { sort: 'asc', nulls: 'first' } }, { raisedAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.shortfall.count({ where }),
    countByFilter(user, query),
  ]);

  return {
    rows: rows.map(shapeListRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
    /** True when this user answers shortfalls rather than deciding them. */
    isApplicant: isLtp(user),
  };
}

async function countByFilter(
  user: AuthUser,
  query: ShortfallListQuery
): Promise<Record<string, number>> {
  const base: Prisma.ShortfallWhereInput[] = [
    { application: { deletedAt: null, ...applicationScope(user) } },
    ...(query.applicationId ? [{ applicationId: query.applicationId }] : []),
  ];

  const keys = Object.values(SHORTFALL_FILTERS);
  const results = await Promise.all(
    keys.map((key) => prisma.shortfall.count({ where: { AND: [...base, filterWhere(key)] } }))
  );

  return Object.fromEntries(keys.map((key, i) => [key, results[i]!]));
}

function shapeListRow(row: ListRow) {
  return {
    id: row.id,
    shortfallNumber: row.shortfallNumber,
    kind: row.kind,
    mode: row.mode,
    status: row.status,
    turn: turnOf(row.status),
    title: row.title,
    description: row.description,
    requiredAction: row.requiredAction,
    raisedAtStageCode: row.raisedAtStageCode,
    raisedByRoleKey: row.raisedByRoleKey,
    raisedByName: row.raisedBy?.name ?? '',
    raisedAt: row.raisedAt,
    dueDate: row.dueDate,
    notifiedAt: row.notifiedAt,
    closedAt: row.closedAt,
    itemCount: row.items.length,
    attempts: row.resolutions.length,
    amount: row.items.reduce((sum, i) => sum + (i.amount ? Number(i.amount) : 0), 0),
    application: {
      id: row.application.id,
      applicationNumber: row.application.applicationNumber,
      status: row.application.status,
      currentStageCode: row.application.currentStageCode,
      applicantName: row.application.applicant?.name ?? '—',
      type: row.application.applicationType.name,
      zone: row.application.zone?.name ?? '—',
    },
    demands: row.feeDemands.map((d) => ({
      id: d.id,
      demandNumber: d.demandNumber,
      status: d.status,
      totalAmount: d.totalAmount,
      paidAmount: d.paidAmount,
    })),
  };
}

export type ShortfallDetail = Awaited<ReturnType<typeof getShortfall>>;

/**
 * One shortfall, with everything the detail screen shows.
 *
 * Row scope goes into the WHERE, so a shortfall on somebody else's application
 * is "not found" rather than "forbidden" — the same rule the application
 * endpoints follow, and for the same reason: distinguishing them would confirm
 * which references exist.
 */
export async function getShortfall(user: AuthUser, shortfallId: string) {
  if (!isUuid(shortfallId)) throw notFound('That shortfall could not be found.');

  const row = await prisma.shortfall.findFirst({
    where: {
      id: shortfallId,
      application: { deletedAt: null, ...applicationScope(user) },
    },
    select: {
      ...LIST_SELECT,
      closedBy: { select: { id: true, name: true } },
    },
  });

  if (!row) throw notFound('That shortfall could not be found.');

  return {
    ...shapeListRow(row),
    closedByName: row.closedBy?.name ?? '',
    closureRemarks: row.closureRemarks,
    items: row.items.map((item) => ({
      id: item.id,
      description: item.description,
      amount: item.amount,
      isResolved: item.isResolved,
      documentTypeId: item.documentTypeId,
      documentTypeCode: item.documentType?.code ?? '',
      documentTypeName: item.documentType?.name ?? '',
    })),
    resolutions: row.resolutions.map((r) => ({
      id: r.id,
      attemptNo: r.attemptNo,
      response: r.response,
      attachments: r.attachments,
      respondedAt: r.respondedAt,
      respondedByName: r.respondedBy?.name ?? '',
      reviewedAt: r.reviewedAt,
      reviewedByName: r.reviewedBy?.name ?? '',
      accepted: r.accepted,
      reviewRemarks: r.reviewRemarks,
    })),
  };
}

/** Open shortfalls on one application — the banner's source. */
export async function openShortfallsFor(user: AuthUser, applicationId: string) {
  const rows = await prisma.shortfall.findMany({
    where: {
      applicationId,
      status: { notIn: [...CLOSED_SHORTFALL_STATUSES] },
      application: { deletedAt: null, ...applicationScope(user) },
    },
    select: LIST_SELECT,
    orderBy: { raisedAt: 'asc' },
  });

  return rows.map(shapeListRow);
}

/** The counts behind the dashboard tile and the nav badge. */
export async function shortfallSummary(user: AuthUser) {
  const scope: Prisma.ShortfallWhereInput = {
    application: { deletedAt: null, ...applicationScope(user) },
  };

  const [open, awaitingApplicant, awaitingOfficer, overdue] = await Promise.all([
    prisma.shortfall.count({
      where: { AND: [scope, filterWhere(SHORTFALL_FILTERS.OPEN)] },
    }),
    prisma.shortfall.count({
      where: { AND: [scope, filterWhere(SHORTFALL_FILTERS.AWAITING_APPLICANT)] },
    }),
    prisma.shortfall.count({
      where: { AND: [scope, filterWhere(SHORTFALL_FILTERS.AWAITING_OFFICER)] },
    }),
    prisma.shortfall.count({
      where: { AND: [scope, filterWhere(SHORTFALL_FILTERS.OVERDUE)] },
    }),
  ]);

  return { open, awaitingApplicant, awaitingOfficer, overdue };
}

export type { ShortfallRow };
