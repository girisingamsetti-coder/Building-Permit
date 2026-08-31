import { defineRoute } from '@/server/http/route';
import { prisma } from '@/server/db/prisma';
import { CAPABILITIES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * The reference data the user forms need: roles, departments, offices, zones.
 * One request rather than four, because the form needs all of them at once.
 */
export const GET = defineRoute(
  async () => {
    const [roles, departments, offices, zones] = await Promise.all([
      prisma.role.findMany({
        where: { deletedAt: null },
        select: { key: true, name: true, description: true, rank: true },
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

    return { roles, departments, offices, zones };
  },
  { capabilities: [CAPABILITIES.USER_MANAGE, CAPABILITIES.ORG_MANAGE] }
);
