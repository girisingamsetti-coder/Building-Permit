import { PrismaClient } from '@prisma/client';
import { getDashboardData } from '../src/server/services/analytics';
import { RBAC_MATRIX } from '../src/lib/rbac-matrix';
import type { RoleKey } from '../src/lib/constants';

const prisma = new PrismaClient();

async function main() {
  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin.demo@example.com' },
    include: { roles: { include: { role: true } }, jurisdictions: true },
  });

  if (!adminUser) {
    console.error('Admin user not found.');
    process.exit(1);
  }

  const roleKeys = adminUser.roles.map((r) => r.role.key as RoleKey);
  const zoneIds = [
    ...new Set([
      ...(adminUser.primaryZoneId ? [adminUser.primaryZoneId] : []),
      ...adminUser.jurisdictions.map((j) => j.zoneId),
    ]),
  ];

  const actor = {
    id: adminUser.id,
    name: adminUser.name,
    email: adminUser.email,
    roleKeys,
    capabilities: [...new Set(roleKeys.flatMap((key) => RBAC_MATRIX[key] as unknown as string[]))],
    zoneIds,
    officeId: adminUser.officeId,
    sessionId: 'demo-check',
  };

  const data = await getDashboardData(actor, null);

  console.log('--- DASHBOARD DATA CHECK ---');
  let hasZeroes = false;

  const check = (label: string, value: number | string) => {
    console.log(`${label}: ${value}`);
    if (value === 0 || value === '0' || value === '0.00' || value === '0%') {
      console.log(`  -> [WARN] ${label} is ZERO!`);
      hasZeroes = true;
    }
  };

  check('Total Applications', data.applications.total);
  check('In Progress Applications', data.applications.inProgress);
  check('Approved Applications', data.applications.approved);
  check('Rejected Applications', data.applications.rejected);
  check('Open Shortfalls', data.shortfalls.open);
  check('Overdue Tasks', data.sla.overdue);
  check('Due Soon Tasks', data.sla.dueSoon);
  check('Fees Generated', data.finance.generated);
  check('Fees Collected', data.finance.collected);
  check('Pending Fee', data.finance.outstanding);
  check('Payment Success Rate', data.finance.payments.successRate + '%');
  
  if (!hasZeroes) {
    console.log('\nSUCCESS: All unified dashboard cards have non-zero data!');
  } else {
    console.log('\nWARNING: Some unified dashboard cards still show zero.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
