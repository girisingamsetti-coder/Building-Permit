import type { PrismaClient } from '@prisma/client';

/**
 * Departments, zones and offices.
 *
 * Placeholder structure. The real establishment — how many zones, their names
 * and codes, which offices sit in which — has not been supplied, and per
 * architectural Rule 6 nothing has been invented that looks authoritative.
 * These are obviously generic (Zone I…V) so nobody mistakes them for the
 * department's actual structure. An administrator edits them in the admin UI.
 */

const DEPARTMENTS = [
  { code: 'TP', name: 'Town Planning' },
  { code: 'FIN', name: 'Finance' },
  { code: 'ADMIN', name: 'Administration' },
];

const ZONES = [
  { code: 'Z1', name: 'Zone I' },
  { code: 'Z2', name: 'Zone II' },
  { code: 'Z3', name: 'Zone III' },
  { code: 'Z4', name: 'Zone IV' },
  { code: 'Z5', name: 'Zone V' },
];

export async function seedOrg(prisma: PrismaClient) {
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: d.code },
      create: d,
      update: { name: d.name },
    });
  }

  for (const z of ZONES) {
    await prisma.zone.upsert({
      where: { code: z.code },
      create: z,
      update: { name: z.name },
    });
  }

  const townPlanning = await prisma.department.findUniqueOrThrow({ where: { code: 'TP' } });
  const finance = await prisma.department.findUniqueOrThrow({ where: { code: 'FIN' } });
  const admin = await prisma.department.findUniqueOrThrow({ where: { code: 'ADMIN' } });

  // One zonal office per zone, plus head office for city-wide roles.
  for (const z of ZONES) {
    const zone = await prisma.zone.findUniqueOrThrow({ where: { code: z.code } });
    const code = `TP-${z.code}`;
    await prisma.office.upsert({
      where: { code },
      create: {
        code,
        name: `${z.name} Town Planning Office`,
        departmentId: townPlanning.id,
        zoneId: zone.id,
      },
      update: { name: `${z.name} Town Planning Office` },
    });
  }

  await prisma.office.upsert({
    where: { code: 'HO' },
    create: { code: 'HO', name: 'Head Office', departmentId: townPlanning.id },
    update: { name: 'Head Office' },
  });

  await prisma.office.upsert({
    where: { code: 'FIN-HO' },
    create: { code: 'FIN-HO', name: 'Finance Office', departmentId: finance.id },
    update: { name: 'Finance Office' },
  });

  await prisma.office.upsert({
    where: { code: 'IT' },
    create: { code: 'IT', name: 'IT & Systems', departmentId: admin.id },
    update: { name: 'IT & Systems' },
  });

  return {
    departments: DEPARTMENTS.length,
    zones: ZONES.length,
    offices: ZONES.length + 3,
  };
}
