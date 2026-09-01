import type { Metadata } from 'next';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { prisma } from '@/server/db/prisma';
import { PageHeader } from '@/components/common/page-header';
import { UserForm } from '@/features/admin/user-form';

export const metadata: Metadata = { title: 'Create user' };
export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  await requirePageCapability(CAPABILITIES.USER_MANAGE);

  const [roles, departments, offices, zones] = await Promise.all([
    prisma.role.findMany({
      where: { deletedAt: null },
      select: { key: true, name: true, description: true },
      orderBy: { rank: 'asc' },
    }),
    prisma.department.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.office.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, code: true, name: true, departmentId: true, zoneId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.zone.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Create user"
        description="The account is usable immediately. Leave the password blank to have one generated."
      />
      <UserForm meta={{ roles, departments, offices, zones }} />
    </div>
  );
}
