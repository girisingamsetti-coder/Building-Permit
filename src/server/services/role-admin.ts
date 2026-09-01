import 'server-only';
import { prisma } from '@/server/db/prisma';
import { audit } from './audit';
import { badRequest, conflict, notFound, businessRule } from '@/server/http/errors';
import type { AuthUser } from '@/server/auth/context';

type Meta = { ip?: string; userAgent?: string; correlationId?: string };

// ═══════════════════════════════════════════════════════════════════════════
// ROLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const ROLE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  isSystem: true,
  rank: true,
  createdAt: true,
  permissions: { select: { permission: { select: { id: true, key: true, module: true, name: true } } } },
  _count: { select: { users: true } },
} as const;

export async function listRoles() {
  return prisma.role.findMany({
    where: { deletedAt: null },
    orderBy: { rank: 'asc' },
    select: ROLE_SELECT,
  });
}

export async function createRole(
  input: { key: string; name: string; description?: string; permissionKeys?: string[] },
  actor: AuthUser,
  meta: Meta = {}
) {
  const clash = await prisma.role.findUnique({ where: { key: input.key } });
  if (clash) throw conflict(`A role with key "${input.key}" already exists.`);

  const permissions = input.permissionKeys?.length
    ? await prisma.permission.findMany({ where: { key: { in: input.permissionKeys } }, select: { id: true } })
    : [];

  return prisma.$transaction(async (tx) => {
    const maxRank = await tx.role.aggregate({ _max: { rank: true } });
    const role = await tx.role.create({
      data: {
        key: input.key.toUpperCase(),
        name: input.name,
        description: input.description ?? '',
        rank: (maxRank._max.rank ?? 0) + 1,
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id, grantedById: actor.id })),
        },
      },
      select: ROLE_SELECT,
    });
    await audit(tx, { actor, action: 'ROLE_CREATED', entityType: 'Role', entityId: role.id, after: { key: role.key, name: role.name }, ...meta });
    return role;
  });
}

export async function updateRole(
  id: string,
  input: { name?: string; description?: string },
  actor: AuthUser,
  meta: Meta = {}
) {
  const role = await prisma.role.findFirst({ where: { id, deletedAt: null } });
  if (!role) throw notFound('Role not found.');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.role.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      select: { id: true, key: true, name: true, description: true },
    });
    await audit(tx, { actor, action: 'ROLE_UPDATED', entityType: 'Role', entityId: id, before: { name: role.name, description: role.description }, after: updated, ...meta });
    return updated;
  });
}

export async function deleteRole(id: string, actor: AuthUser, meta: Meta = {}) {
  const role = await prisma.role.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { users: true } } } });
  if (!role) throw notFound('Role not found.');
  if (role.isSystem) throw businessRule('System roles cannot be deleted.');
  if (role._count.users > 0) throw businessRule(`Cannot delete: ${role._count.users} user(s) hold this role. Reassign them first.`);

  return prisma.$transaction(async (tx) => {
    await tx.role.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { actor, action: 'ROLE_DELETED', entityType: 'Role', entityId: id, before: { key: role.key, name: role.name }, ...meta });
    return { ok: true };
  });
}

export async function setRolePermissions(
  id: string,
  permissionKeys: string[],
  actor: AuthUser,
  meta: Meta = {}
) {
  const role = await prisma.role.findFirst({ where: { id, deletedAt: null } });
  if (!role) throw notFound('Role not found.');

  const permissions = await prisma.permission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true, key: true },
  });

  const unknown = permissionKeys.filter((k) => !permissions.find((p) => p.key === k));
  if (unknown.length) throw badRequest(`Unknown permission keys: ${unknown.join(', ')}`);

  const before = await prisma.rolePermission.findMany({
    where: { roleId: id },
    select: { permission: { select: { key: true } } },
  });
  const beforeKeys = before.map((rp) => rp.permission.key).sort();

  return prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: id } });
    if (permissions.length) {
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: id, permissionId: p.id, grantedById: actor.id })),
      });
    }
    await audit(tx, {
      actor,
      action: 'ROLE_PERMISSIONS_UPDATED',
      entityType: 'Role',
      entityId: id,
      before: { permissionKeys: beforeKeys },
      after: { permissionKeys: permissionKeys.slice().sort() },
      ...meta,
    });
    return { ok: true, count: permissions.length };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION CATALOGUE
// ═══════════════════════════════════════════════════════════════════════════

export async function listPermissions() {
  return prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { key: 'asc' }],
    select: { id: true, key: true, module: true, name: true, description: true },
  });
}
