import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { hashPassword } from '@/server/auth/password';
import { audit } from './audit';
import { badRequest, conflict, notFound } from '@/server/http/errors';
import type { AuthUser } from '@/server/auth/context';
import { ROLES } from '@/lib/constants';
import type { CreateUserInput, UpdateUserInput, UserListQuery } from '@/lib/schemas/users';

/**
 * User administration.
 *
 * Two safety rules run through it, both about not locking the organisation out
 * of its own system:
 *
 *  · an administrator cannot deactivate or demote themselves;
 *  · the last active SYSTEM_ADMIN cannot be removed or demoted.
 *
 * Both are enforced here rather than in the UI, because the UI is not where
 * this can be trusted.
 */

type Meta = { ip: string; userAgent: string; correlationId?: string };

const LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  designation: true,
  employeeCode: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  mustChangePassword: true,
  lockedUntil: true,
  office: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, code: true, name: true } },
  primaryZone: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { key: true, name: true } } } },
  /**
   * Open workload.
   *
   * A filtered relation count rather than a second query per row: an
   * administrator deciding whether to deactivate an officer needs to know
   * whether that officer is holding eleven files first, and finding out by
   * opening each account in turn is how it gets skipped.
   */
  _count: { select: { tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } },
} satisfies Prisma.UserSelect;

export async function listUsers(query: UserListQuery) {
  const where: Prisma.UserWhereInput = { deletedAt: null };

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
      { employeeCode: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.status) where.status = query.status;
  if (query.role) where.roles = { some: { role: { key: query.role } } };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: rows.map(shape),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getUser(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...LIST_SELECT,
      ltpLicenceNo: true,
      ltpLicenceClass: true,
      ltpValidUpto: true,
      firmName: true,
      failedLoginCount: true,
      jurisdictions: { select: { zone: { select: { id: true, code: true, name: true } } } },
    },
  });

  if (!user) throw notFound('That user could not be found.');

  return {
    ...shape(user),
    ltpLicenceNo: user.ltpLicenceNo,
    ltpLicenceClass: user.ltpLicenceClass,
    ltpValidUpto: user.ltpValidUpto,
    firmName: user.firmName,
    failedLoginCount: user.failedLoginCount,
    zones: user.jurisdictions.map((j) => j.zone),
  };
}

/** Recent activity for the user detail page. */
export async function getUserActivity(id: string, limit = 20) {
  const [audits, attempts] = await Promise.all([
    prisma.auditLog.findMany({
      where: { OR: [{ actorId: id }, { entityType: 'User', entityId: id }] },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      select: { id: true, action: true, remarks: true, occurredAt: true, actorName: true, ip: true },
    }),
    prisma.loginAttempt.findMany({
      where: { email: (await prisma.user.findUnique({ where: { id }, select: { email: true } }))?.email ?? '' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, success: true, reason: true, ip: true, createdAt: true },
    }),
  ]);

  return { audits, attempts };
}

export async function createUser(input: CreateUserInput, actor: AuthUser, meta: Meta) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('An account already exists with that email address.');

  const role = await prisma.role.findUnique({ where: { key: input.roleKey } });
  if (!role) throw badRequest('That role does not exist.');

  // Generated when the administrator does not set one: a random password the
  // user must change beats a shared default nobody rotates.
  const generated = input.password ? null : generatePassword();
  const passwordHash = await hashPassword(input.password ?? generated!);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        phone: input.phone || null,
        designation: input.designation,
        employeeCode: input.employeeCode || null,
        passwordHash,
        mustChangePassword: !input.password,
        departmentId: input.departmentId ?? null,
        officeId: input.officeId ?? null,
        primaryZoneId: input.primaryZoneId ?? null,
        ltpLicenceNo: input.ltpLicenceNo || null,
        ltpLicenceClass: input.ltpLicenceClass || null,
        ltpValidUpto: input.ltpValidUpto ? new Date(input.ltpValidUpto) : null,
        firmName: input.firmName || null,
        createdById: actor.id,
        roles: { create: { roleId: role.id, assignedById: actor.id } },
        jurisdictions: { create: input.zoneIds.map((zoneId) => ({ zoneId })) },
      },
      select: LIST_SELECT,
    });

    await audit(tx, {
      actor,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: created.id,
      after: { email: created.email, name: created.name, role: role.key },
      ...meta,
    });

    return created;
  });

  // Returned once, shown once, never stored in readable form.
  return { user: shape(user), generatedPassword: generated };
}

export async function updateUser(id: string, input: UpdateUserInput, actor: AuthUser, meta: Meta) {
  const before = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { roles: { include: { role: true } }, jurisdictions: true },
  });
  if (!before) throw notFound('That user could not be found.');

  if (input.email && input.email !== before.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email } });
    if (clash) throw conflict('An account already exists with that email address.');
  }

  const currentRole = before.roles[0]?.role.key;

  if (input.roleKey && input.roleKey !== currentRole) {
    // Self-check first: when both rules apply, this is the one the person can
    // act on.
    if (id === actor.id) {
      throw badRequest('You cannot change your own role. Ask another administrator to do it.');
    }
    await assertNotLastAdmin(id, currentRole, input.roleKey);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.UserUpdateInput = {
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.designation !== undefined ? { designation: input.designation } : {}),
      ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode || null } : {}),
      ...(input.departmentId !== undefined
        ? { department: input.departmentId ? { connect: { id: input.departmentId } } : { disconnect: true } }
        : {}),
      ...(input.officeId !== undefined
        ? { office: input.officeId ? { connect: { id: input.officeId } } : { disconnect: true } }
        : {}),
      ...(input.primaryZoneId !== undefined
        ? { primaryZone: input.primaryZoneId ? { connect: { id: input.primaryZoneId } } : { disconnect: true } }
        : {}),
      ...(input.ltpLicenceNo !== undefined ? { ltpLicenceNo: input.ltpLicenceNo || null } : {}),
      ...(input.ltpLicenceClass !== undefined ? { ltpLicenceClass: input.ltpLicenceClass || null } : {}),
      ...(input.ltpValidUpto !== undefined
        ? { ltpValidUpto: input.ltpValidUpto ? new Date(input.ltpValidUpto) : null }
        : {}),
      ...(input.firmName !== undefined ? { firmName: input.firmName || null } : {}),
    };

    await tx.user.update({ where: { id }, data });

    if (input.roleKey && input.roleKey !== currentRole) {
      const role = await tx.role.findUniqueOrThrow({ where: { key: input.roleKey } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.create({ data: { userId: id, roleId: role.id, assignedById: actor.id } });
    }

    if (input.zoneIds) {
      await tx.userJurisdiction.deleteMany({ where: { userId: id } });
      if (input.zoneIds.length) {
        await tx.userJurisdiction.createMany({
          data: input.zoneIds.map((zoneId) => ({ userId: id, zoneId })),
          skipDuplicates: true,
        });
      }
    }

    // Re-read AFTER the role and jurisdiction writes. Selecting on the update
    // above returned the pre-change role, so a role reassignment reported the
    // old value back to the caller.
    const row = await tx.user.findUniqueOrThrow({ where: { id }, select: LIST_SELECT });

    await audit(tx, {
      actor,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      before: { email: before.email, name: before.name, role: currentRole },
      after: { email: row.email, name: row.name, role: input.roleKey ?? currentRole },
      ...meta,
    });

    return row;
  });

  return shape(updated);
}

export async function setUserStatus(
  id: string,
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  reason: string,
  actor: AuthUser,
  meta: Meta
) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw notFound('That user could not be found.');

  // Locking yourself out helps nobody.
  if (id === actor.id && status !== 'ACTIVE') {
    throw badRequest('You cannot deactivate your own account.');
  }

  if (status !== 'ACTIVE' && user.roles.some((r) => r.role.key === ROLES.SYSTEM_ADMIN)) {
    await assertNotLastAdmin(id, ROLES.SYSTEM_ADMIN, null);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id },
      data: {
        status,
        // Reactivating clears the lockout — otherwise the account is "active"
        // and still cannot sign in, which reads as a bug.
        ...(status === 'ACTIVE' ? { lockedUntil: null, failedLoginCount: 0 } : {}),
      },
      select: LIST_SELECT,
    });

    // A deactivated account's live sessions must not survive the decision.
    if (status !== 'ACTIVE') {
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: `status_${status.toLowerCase()}` },
      });
    }

    await audit(tx, {
      actor,
      action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: id,
      before: { status: user.status },
      after: { status },
      remarks: reason,
      ...meta,
    });

    return row;
  });

  return shape(updated);
}

/** Admin-initiated reset: sets a temporary password the user must change. */
export async function resetUserPassword(id: string, actor: AuthUser, meta: Meta) {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) throw notFound('That user could not be found.');

  const temporary = generatePassword();
  const passwordHash = await hashPassword(temporary);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        status: user.status === 'LOCKED' ? 'ACTIVE' : user.status,
      },
    });

    await tx.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'admin_password_reset' },
    });

    await audit(tx, {
      actor,
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: id,
      remarks: 'Temporary password issued by an administrator',
      ...meta,
    });
  });

  return { temporaryPassword: temporary };
}

export async function unlockUser(id: string, actor: AuthUser, meta: Meta) {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) throw notFound('That user could not be found.');

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { lockedUntil: null, failedLoginCount: 0, status: user.status === 'LOCKED' ? 'ACTIVE' : user.status },
    });
    await audit(tx, {
      actor,
      action: 'USER_UNLOCKED',
      entityType: 'User',
      entityId: id,
      ...meta,
    });
  });

  return { ok: true };
}

// ── Internals ─────────────────────────────────────────────────────────────

/**
 * Refuses the change if it would leave no active system administrator.
 *
 * `nextRole` is null when the user is being deactivated rather than demoted.
 */
async function assertNotLastAdmin(userId: string, currentRole: string | undefined, nextRole: string | null) {
  if (currentRole !== ROLES.SYSTEM_ADMIN) return;
  if (nextRole === ROLES.SYSTEM_ADMIN) return;

  const remaining = await prisma.user.count({
    where: {
      id: { not: userId },
      deletedAt: null,
      status: 'ACTIVE',
      roles: { some: { role: { key: ROLES.SYSTEM_ADMIN } } },
    },
  });

  if (remaining === 0) {
    throw badRequest(
      'This is the only active system administrator. Give another account that role first, ' +
        'otherwise nobody will be able to administer the system.'
    );
  }
}

/** Readable, unambiguous, and long enough to be worth generating. */
function generatePassword(): string {
  // No 0/O/1/l/I — a temporary password gets read aloud and typed by hand.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(14);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

type Shapeable = {
  roles: Array<{ role: { key: string; name: string } }>;
  [key: string]: unknown;
};

function shape<T extends Shapeable>(user: T) {
  const { roles, _count, ...rest } = user as T & { _count?: { tasks: number } };
  return {
    ...rest,
    roleKeys: roles.map((r) => r.role.key),
    roleNames: roles.map((r) => r.role.name),
    // Named rather than passed through as `_count`: the client should not have
    // to know that "open files" is a filtered relation count in Prisma.
    openTasks: _count?.tasks ?? 0,
  };
}
