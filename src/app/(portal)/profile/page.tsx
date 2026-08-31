import type { Metadata } from 'next';
import { requirePageUser } from '@/server/auth/page-guard';
import { prisma } from '@/server/db/prisma';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/common/status-badge';
import { ChangePasswordForm } from '@/features/auth/change-password-form';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const auth = await requirePageUser();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.id },
    select: {
      name: true,
      email: true,
      phone: true,
      designation: true,
      employeeCode: true,
      status: true,
      lastLoginAt: true,
      mustChangePassword: true,
      office: { select: { name: true } },
      department: { select: { name: true } },
      primaryZone: { select: { name: true } },
    },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Profile" description="Your account details and password." />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>
              Contact an administrator to change any of these.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Name">{user.name}</Detail>
              <Detail label="Email">{user.email}</Detail>
              <Detail label="Mobile">{user.phone || '—'}</Detail>
              <Detail label="Designation">{user.designation || '—'}</Detail>
              <Detail label="Staff code">{user.employeeCode || '—'}</Detail>
              <Detail label="Status">
                <StatusBadge kind="user" status={user.status} />
              </Detail>
              <Detail label="Role">
                <div className="flex flex-wrap gap-1">
                  {auth.roleNames.map((r) => (
                    <Badge key={r} tone="info">
                      {r}
                    </Badge>
                  ))}
                </div>
              </Detail>
              <Detail label="Office">{user.office?.name ?? '—'}</Detail>
              <Detail label="Zone">{user.primaryZone?.name ?? '—'}</Detail>
              <Detail label="Last signed in">
                {user.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'This is your first session'}
              </Detail>
            </dl>
          </CardContent>
        </Card>

        <Card id="change-password">
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Changing it signs out every other device. This one stays signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm mustChange={user.mustChangePassword} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-medium uppercase tracking-wide text-text-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-small text-text">{children}</dd>
    </div>
  );
}
