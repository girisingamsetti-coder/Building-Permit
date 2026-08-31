import type { Metadata } from 'next';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { prisma } from '@/server/db/prisma';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Roles' };
export const dynamic = 'force-dynamic';

/**
 * Read-only view of the permission matrix.
 *
 * Editing grants arrives with the role editor in a later phase. Showing the
 * matrix now matters: an administrator assigning roles needs to see what each
 * one actually permits, and the answer should come from the database rather
 * than from a document.
 */
export default async function RolesPage() {
  await requirePageCapability(CAPABILITIES.ROLE_MANAGE);

  const roles = await prisma.role.findMany({
    where: { deletedAt: null },
    orderBy: { rank: 'asc' },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      permissions: { select: { permission: { select: { key: true, module: true } } } },
      _count: { select: { users: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Roles"
        description="What each role may do. Enforced on the server on every request — the interface only decides what to show."
      />

      <div className="space-y-4">
        {roles.map((role) => {
          const byModule = new Map<string, string[]>();
          for (const { permission } of role.permissions) {
            const list = byModule.get(permission.module) ?? [];
            list.push(permission.key);
            byModule.set(permission.module, list);
          }

          return (
            <Card key={role.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle>{role.name}</CardTitle>
                    <CardDescription>{role.description}</CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone="outline" className="font-mono">
                      {role.key}
                    </Badge>
                    <Badge tone="info">
                      {role._count.users} {role._count.users === 1 ? 'user' : 'users'}
                    </Badge>
                    <Badge tone="neutral">{role.permissions.length} capabilities</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[...byModule.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([module, keys]) => (
                    <div key={module}>
                      <p className="pb-1 text-caption font-semibold uppercase tracking-wide text-text-subtle">
                        {module}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {keys.sort().map((key) => (
                          <Badge key={key} tone="outline" className="font-mono text-[10px]">
                            {key}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
