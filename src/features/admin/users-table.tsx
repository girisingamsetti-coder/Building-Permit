'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, UserPlus, Users } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/common/empty-state';
import { ROLE_META } from '@/lib/rbac-matrix';
import { ROLES, type RoleKey } from '@/lib/constants';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  designation: string;
  employeeCode: string | null;
  lastLoginAt: string | null;
  roleKeys: string[];
  roleNames: string[];
  /** Open workflow tasks currently held by this account. */
  openTasks: number;
  office: { name: string } | null;
  primaryZone: { code: string } | null;
};

const ANY = '__any__';

const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LOCKED'] as const;

export function UsersTable({
  users,
  initialRole = '',
  initialStatus = '',
  initialQuery = '',
}: {
  users: UserRow[];
  /** Seeded from the URL, so a link that says "ZJD accounts" arrives filtered. */
  initialRole?: string;
  initialStatus?: string;
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState(initialQuery);
  const [role, setRole] = React.useState<string>(initialRole || ANY);
  const [status, setStatus] = React.useState<string>(initialStatus || ANY);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (role !== ANY && !u.roleKeys.includes(role)) return false;
      if (status !== ANY && u.status !== status) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roleNames.some((r) => r.toLowerCase().includes(q)) ||
        (u.employeeCode ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, query, role, status]);

  const columns = React.useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/admin/settings/users/${row.original.id}`}
              className="font-medium text-text hover:text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.name}
            </Link>
            <p className="truncate text-caption text-text-muted">{row.original.email}</p>
          </div>
        ),
      },
      {
        id: 'roles',
        header: 'Role',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roleNames.map((r) => (
              <Badge key={r} tone="info">
                {r}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'posting',
        header: 'Posting',
        cell: ({ row }) => (
          <div className="text-small text-text-muted">
            <p>{row.original.office?.name ?? '—'}</p>
            {row.original.primaryZone && (
              <p className="text-caption text-text-subtle">Zone {row.original.primaryZone.code}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge kind="user" status={row.original.status} />,
      },
      {
        id: 'workload',
        header: 'Open files',
        cell: ({ row }) =>
          row.original.openTasks > 0 ? (
            <Badge tone="warning">{row.original.openTasks}</Badge>
          ) : (
            <span className="text-small text-text-subtle">—</span>
          ),
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Last signed in',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-small text-text-muted">
            {formatWhen(row.original.lastLoginAt)}
          </span>
        ),
      },
    ],
    []
  );

  if (!users.length) {
    return (
      <div className="rounded border border-border bg-surface">
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Create the first account to get started."
          action={
            <Button asChild variant="primary">
              <Link href="/admin/settings/users/new">
                <UserPlus className="size-4" />
                Create user
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, role or staff code"
            aria-label="Search users"
            className="pl-8"
          />
        </div>

        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-[13rem]" aria-label="Filter by role">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All roles</SelectItem>
            {(Object.values(ROLES) as RoleKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {ROLE_META[key]?.name ?? key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[10rem]" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All statuses</SelectItem>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(role !== ANY || status !== ANY || query) && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery('');
              setRole(ANY);
              setStatus(ANY);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <p className="text-caption text-text-muted" aria-live="polite">
        {filtered.length} of {users.length} {users.length === 1 ? 'user' : 'users'}
      </p>

      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(row) => router.push(`/admin/settings/users/${row.id}`)}
        emptyTitle="No users match these filters"
        emptyDescription="Try a different name, role or status — or clear the filters."
      />
    </div>
  );
}

function formatWhen(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
