import type { Metadata } from 'next';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { listUsers } from '@/server/services/users';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { UsersTable, type UserRow } from '@/features/admin/users-table';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

/**
 * The role and status filters are read from the URL rather than held only in
 * the table's own state, so the links that arrive here from the administrator's
 * dashboard ("12 accounts hold ZJD") land on the list already filtered. A link
 * that drops its filter on arrival is a link that lies about where it goes.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageCapability(CAPABILITIES.USER_MANAGE);

  const params = await searchParams;
  const first = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? '';
  };

  const { data, total } = await listUsers({ page: 1, pageSize: 100 });

  return (
    <>
      <PageHeader
        title="Users"
        description={`${total} ${total === 1 ? 'account' : 'accounts'}`}
        actions={
          <Button asChild variant="primary">
            <Link href="/admin/users/new">
              <UserPlus className="size-4" />
              Create user
            </Link>
          </Button>
        }
      />
      <UsersTable
        users={data as unknown as UserRow[]}
        initialRole={first('role')}
        initialStatus={first('status')}
        initialQuery={first('q')}
      />
    </>
  );
}
