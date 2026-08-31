import { describe, it, expect, afterAll } from 'vitest';
import { prisma, databaseAvailable } from './setup';
import { RBAC_MATRIX, ROLE_META } from '@/lib/rbac-matrix';
import { CAPABILITIES, ROLES, type RoleKey } from '@/lib/constants';

/**
 * The database must match the matrix.
 *
 * docs/04-rbac.md H.4 is only meaningful if the grants actually in Postgres
 * are the grants the matrix declares. This is the test that stops the document
 * from becoming a description of a system nobody built.
 */

// Resolved once at module load: suites skip rather than fail when no database
// is reachable, so `npm run test` still works on a machine without Docker.
const dbUp = await databaseAvailable();

afterAll(async () => {
  await prisma.$disconnect();
});

const allRoles = Object.values(ROLES) as RoleKey[];

describe.runIf(dbUp)('seeded RBAC', () => {
  it('has every role', async () => {
    const roles = await prisma.role.findMany({ select: { key: true } });
    expect(roles.map((r) => r.key).sort()).toEqual([...allRoles].sort());
  });

  it('has every capability', async () => {
    const permissions = await prisma.permission.findMany({ select: { key: true } });
    const expected = Object.values(CAPABILITIES).sort();
    expect(permissions.map((p) => p.key).sort()).toEqual(expected);
  });

  it.each(allRoles)('grants %s exactly what the matrix declares', async (roleKey) => {
    const role = await prisma.role.findUnique({
      where: { key: roleKey },
      include: { permissions: { include: { permission: true } } },
    });

    expect(role).not.toBeNull();

    const inDatabase = role!.permissions.map((p) => p.permission.key).sort();
    const inMatrix = [...RBAC_MATRIX[roleKey]].sort();

    expect(inDatabase).toEqual(inMatrix);
  });

  it('stores the role metadata', async () => {
    for (const roleKey of allRoles) {
      const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
      expect(role.name).toBe(ROLE_META[roleKey].name);
      expect(role.isSystem).toBe(true);
    }
  });

  it('has no orphaned grant pointing at a deleted permission', async () => {
    const orphans = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM role_permissions rp
      LEFT JOIN permissions p ON p.id = rp."permissionId"
      WHERE p.id IS NULL;
    `;
    expect(Number(orphans[0]?.count ?? 0)).toBe(0);
  });

  it('grants APPLICATION_APPROVE to exactly one role', async () => {
    const grants = await prisma.rolePermission.findMany({
      where: { permission: { key: CAPABILITIES.APPLICATION_APPROVE } },
      include: { role: true },
    });
    expect(grants).toHaveLength(1);
    expect(grants[0]!.role.key).toBe(ROLES.COMMISSIONER);
  });

  it('has no SCRUTINY_OVERRIDE permission row at all', async () => {
    const row = await prisma.permission.findFirst({ where: { key: 'SCRUTINY_OVERRIDE' } });
    expect(row).toBeNull();
  });
});

describe.runIf(dbUp)('seeded demo accounts', () => {
  const demoEmails = [
    'ltp.demo@example.com',
    'tpa.demo@example.com',
    'zad.demo@example.com',
    'zdd.demo@example.com',
    'zjd.demo@example.com',
    'director.demo@example.com',
    'addlcommissioner.demo@example.com',
    'commissioner.demo@example.com',
    'finance.demo@example.com',
    'admin.demo@example.com',
    'viewer.demo@example.com',
  ];

  it('has all eleven, active, each with exactly one role', async () => {
    for (const email of demoEmails) {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { roles: true },
      });

      expect(user, `${email} was not seeded`).not.toBeNull();
      expect(user!.status).toBe('ACTIVE');
      expect(user!.deletedAt).toBeNull();
      expect(user!.roles).toHaveLength(1);
    }
  });

  it('never stores a demo password in readable form', async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: demoEmails } },
      select: { passwordHash: true },
    });

    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain('Demo@12345');
    }
  });

  it('scopes zonal officers to zones and leaves city-wide roles unscoped', async () => {
    const tpa = await prisma.user.findUniqueOrThrow({
      where: { email: 'tpa.demo@example.com' },
      include: { jurisdictions: true },
    });
    expect(tpa.jurisdictions.length).toBeGreaterThan(0);
    expect(tpa.primaryZoneId).not.toBeNull();

    const commissioner = await prisma.user.findUniqueOrThrow({
      where: { email: 'commissioner.demo@example.com' },
      include: { jurisdictions: true },
    });
    expect(commissioner.jurisdictions).toHaveLength(0);
  });
});
