import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/server/auth/password';
import { ROLES } from '../../src/lib/constants';

/**
 * The System Administrator account, from the environment.
 *
 * ── Why this exists alongside the demo accounts ──────────────────────────
 *
 * `03-users.ts` creates `admin.demo@example.com` with a password that is
 * printed to the console and written in the README. That is exactly right for
 * a demonstration and exactly wrong for anything else, and it is seeded ONLY
 * when DEMO_MODE is on.
 *
 * A real deployment still needs a way in, and the two bad answers are a
 * password committed to this file and a first-run screen that lets whoever
 * reaches it first become the administrator. So the credential comes from the
 * environment, where secrets already live (docs A.6), and it is never written
 * into the repository.
 *
 *   SUPER_ADMIN_EMAIL=admin@example.gov.in
 *   SUPER_ADMIN_PASSWORD='<from the secret store>'
 *
 * ── mustChangePassword is set, and that is not ceremony ──────────────────
 *
 * The value passed here has been in a shell, an environment file and probably
 * a deployment log. It is a bootstrap credential, not a password, and the
 * account is required to replace it at first sign-in.
 *
 * Re-running is safe: an existing account keeps its password unless
 * SUPER_ADMIN_RESET_PASSWORD is explicitly set, so a routine `db:seed` on a
 * live system cannot silently reset the administrator's credential back to
 * whatever the deployment environment happens to still be carrying.
 */

export type SuperAdminResult =
  | { seeded: false; reason: string }
  | { seeded: true; email: string; created: boolean; passwordSet: boolean };

export async function seedSuperAdmin(prisma: PrismaClient): Promise<SuperAdminResult> {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD ?? '';
  const resetPassword = (process.env.SUPER_ADMIN_RESET_PASSWORD ?? '').toLowerCase() === 'true';

  if (!email) return { seeded: false, reason: 'SUPER_ADMIN_EMAIL is not set' };

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`SUPER_ADMIN_EMAIL is not an email address: ${email}`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing && !password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL is set but SUPER_ADMIN_PASSWORD is not, so the account cannot be created. ' +
        'Set both, or unset both.'
    );
  }

  // Long rather than clever: this credential is typed once and then replaced,
  // and a composition rule that forces a memorable password is the wrong
  // trade for an account with every capability in the system.
  if (password && password.length < 16) {
    throw new Error(
      'SUPER_ADMIN_PASSWORD must be at least 16 characters. This account holds every capability ' +
        'in the system and its first password travels through a deployment environment.'
    );
  }

  const role = await prisma.role.findUniqueOrThrow({ where: { key: ROLES.SYSTEM_ADMIN } });

  // The office is optional and only cosmetic for a city-wide role, so a
  // deployment without an IT office still gets an administrator.
  const office = await prisma.office.findUnique({ where: { code: 'IT' } });

  const shouldSetPassword = Boolean(password) && (!existing || resetPassword);

  const data = {
    name: process.env.SUPER_ADMIN_NAME ?? 'System Administrator',
    designation: 'System Administrator',
    status: 'ACTIVE' as const,
    officeId: office?.id ?? existing?.officeId ?? null,
    departmentId: office?.departmentId ?? existing?.departmentId ?? null,
    deletedAt: null,
    // Unlock on every run: an administrator locked out by failed sign-ins must
    // have a way back that does not require the administrator.
    failedLoginCount: 0,
    lockedUntil: null,
    ...(shouldSetPassword ? { passwordHash: await hashPassword(password), mustChangePassword: true } : {}),
  };

  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data })
    : await prisma.user.create({
        data: { ...data, email, passwordHash: await hashPassword(password) },
      });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });

  return { seeded: true, email, created: !existing, passwordSet: shouldSetPassword };
}
