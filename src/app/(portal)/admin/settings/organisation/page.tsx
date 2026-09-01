import type { Metadata } from 'next';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { prisma } from '@/server/db/prisma';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Organisation' };
export const dynamic = 'force-dynamic';

export default async function OrganisationPage() {
  await requirePageCapability(CAPABILITIES.ORG_MANAGE);

  const [departments, zones, offices] = await Promise.all([
    prisma.department.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, _count: { select: { users: true, offices: true } } },
    }),
    prisma.zone.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, _count: { select: { offices: true, applications: true } } },
    }),
    prisma.office.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        department: { select: { name: true } },
        zone: { select: { code: true } },
        _count: { select: { users: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader title="Organisation Hierarchy" />

      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Zones</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Offices</TableHead>
                  <TableHead>Applications</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((z) => (
                  <TableRow key={z.id}>
                    <TableCell>
                      <Badge tone="outline" className="font-mono">{z.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{z.name}</TableCell>
                    <TableCell className="tabular-nums">{z._count.offices}</TableCell>
                    <TableCell className="tabular-nums">{z._count.applications}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offices</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Staff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offices.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Badge tone="outline" className="font-mono">{o.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="text-text-muted">{o.department?.name ?? '—'}</TableCell>
                    <TableCell className="text-text-muted">{o.zone?.code ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{o._count.users}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Departments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Offices</TableHead>
                  <TableHead>Staff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Badge tone="outline" className="font-mono">{d.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="tabular-nums">{d._count.offices}</TableCell>
                    <TableCell className="tabular-nums">{d._count.users}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
