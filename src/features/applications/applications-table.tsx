'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { FilePlus2, FileText, MoreHorizontal } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { Pagination } from '@/components/common/pagination';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { stageLabel } from '@/lib/status';
import { actionsFor, primaryActionFor } from '@/lib/application-actions';
import { SORTABLE_FIELDS } from '@/lib/schemas/applications';
import type { ApplicationRow, ListResult } from './types';

/**
 * The application register.
 *
 * Sorting and pagination are SERVER-side, driven through the query string —
 * see ApplicationFilters for why the URL holds the state. Clicking a header
 * navigates; it does not reorder the twenty rows already on screen and imply
 * it reordered all of them.
 */
export function ApplicationsTable({
  result,
  showLtp = false,
}: {
  result: ListResult;
  /** Officers and administrators see whose file it is; an LTP already knows. */
  showLtp?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const sort = searchParams.get('sort') ?? 'updatedAt';
  const dir = searchParams.get('dir') ?? 'desc';

  const push = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams]
  );

  const sorting: SortingState = React.useMemo(
    () => [{ id: sort, desc: dir === 'desc' }],
    [sort, dir]
  );

  const onSortingChange = React.useCallback(
    (next: SortingState) => {
      const first = next[0];
      if (!first) return push({ sort: null, dir: null, page: null });
      // Only the allow-listed columns can be sorted; anything else the table
      // hands back is ignored rather than sent to the server to be rejected.
      if (!(SORTABLE_FIELDS as readonly string[]).includes(first.id)) return;
      push({ sort: first.id, dir: first.desc ? 'desc' : 'asc', page: null });
    },
    [push]
  );

  const columns = React.useMemo<ColumnDef<ApplicationRow, unknown>[]>(() => {
    const cols: ColumnDef<ApplicationRow, unknown>[] = [
      {
        accessorKey: 'applicationNumber',
        header: 'Application',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/applications/${row.original.id}`}
              className="whitespace-nowrap font-medium tabular-nums text-text hover:text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.applicationNumber}
            </Link>
            <p className="truncate text-caption text-text-muted">
              {row.original.applicationType?.name ?? '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'applicant',
        header: 'Applicant',
        enableSorting: false,
        cell: ({ row }) => {
          const applicant = row.original.applicant;
          if (!applicant?.name) {
            return <span className="text-small italic text-text-subtle">Not entered yet</span>;
          }
          return (
            <div className="min-w-0">
              <p className="truncate text-small text-text">{applicant.name}</p>
              {applicant.phone && (
                <p className="truncate text-caption tabular-nums text-text-muted">{applicant.phone}</p>
              )}
            </div>
          );
        },
      },
      {
        id: 'property',
        header: 'Property',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.propertyLabel ? (
            <p className="max-w-[22ch] truncate text-small text-text-muted" title={row.original.propertyLabel}>
              {row.original.propertyLabel}
            </p>
          ) : (
            <span className="text-small italic text-text-subtle">Not entered yet</span>
          ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge kind="application" status={row.original.status} />
            {row.original.openShortfalls > 0 && (
              <Badge tone="warning">{row.original.openShortfalls} open</Badge>
            )}
          </div>
        ),
      },
      {
        id: 'stage',
        header: 'Current stage',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-small text-text-muted">
            {stageLabel(row.original.status, row.original.currentStageCode)}
          </span>
        ),
      },
      {
        id: 'assignedTo',
        header: 'With',
        enableSorting: false,
        cell: ({ row }) => {
          const assigned = row.original.assignedTo;
          if (!assigned) return <span className="text-small text-text-subtle">—</span>;
          return assigned.claimed ? (
            <p className="max-w-[16ch] truncate text-small text-text" title={assigned.name ?? ''}>
              {assigned.name}
            </p>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help whitespace-nowrap text-small text-text-muted">
                  {assigned.roleKey} queue
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Addressed to the {assigned.roleKey} desk and not yet claimed by anyone.
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: 'money',
        header: 'Fee / payment',
        enableSorting: false,
        cell: ({ row }) => <MoneyCell row={row.original} />,
      },
      {
        accessorKey: 'updatedAt',
        header: 'Last updated',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-small text-text-muted" title={formatExact(row.original.updatedAt)}>
            {formatRelative(row.original.updatedAt)}
          </span>
        ),
      },
      {
        accessorKey: 'slaDueAt',
        header: 'SLA',
        cell: ({ row }) => <SlaCell row={row.original} />,
      },
      {
        id: 'action',
        header: 'Action',
        enableSorting: false,
        cell: ({ row }) => <RowActions row={row.original} />,
      },
    ];

    if (showLtp) {
      cols.splice(3, 0, {
        id: 'ltp',
        header: 'Filed by',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-small text-text">{row.original.ltp?.name ?? '—'}</p>
            {row.original.ltp?.firmName && (
              <p className="truncate text-caption text-text-muted">{row.original.ltp.firmName}</p>
            )}
          </div>
        ),
      });
    }

    return cols;
  }, [showLtp]);

  if (result.total === 0) {
    const filtered = Array.from(searchParams.keys()).some(
      (k) => !['page', 'pageSize', 'sort', 'dir'].includes(k)
    );

    return (
      <div className="rounded border border-border bg-surface">
        {filtered ? (
          <EmptyState
            icon={FileText}
            title="No applications match these filters"
            description="Try a wider date range, a different status, or clear the filters to see everything."
            action={
              <Button variant="secondary" onClick={() => router.push(pathname)}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={FilePlus2}
            title="No applications yet"
            description="Start a new application and the wizard will take you through the particulars a step at a time. You can save a draft and come back to it."
            action={
              <Button asChild variant="primary">
                <Link href="/applications/new">
                  <FilePlus2 className="size-4" />
                  New application
                </Link>
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={result.data}
        manualSorting
        sorting={sorting}
        onSortingChange={onSortingChange}
        onRowClick={(row) => router.push(`/applications/${row.id}`)}
        className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
      />

      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        disabled={pending}
        noun="application"
        onPageChange={(page) => push({ page: String(page) })}
      />
    </div>
  );
}

/**
 * Fee and payment, in one column.
 *
 * Two facts, deliberately together: a demand that is issued and a payment that
 * was declined are the same problem from the applicant's side, and splitting
 * them across two columns makes a reader join them by eye on every row.
 */
function MoneyCell({ row }: { row: ApplicationRow }) {
  if (row.feeStatus === 'NONE') {
    return <span className="whitespace-nowrap text-small text-text-subtle">No demand</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusBadge kind="demand" status={row.feeStatus} />
      {row.paymentStatus && row.paymentStatus !== 'SUCCESS' && (
        <StatusBadge kind="payment" status={row.paymentStatus} />
      )}
    </div>
  );
}

/**
 * The SLA column.
 *
 * Shows "Not started" rather than a dash or a zero until Phase 9 starts the
 * clocks. Inventing a due date would be worse than an honest blank — and a
 * dash alone reads as "broken" rather than "not applicable yet".
 */
function SlaCell({ row }: { row: ApplicationRow }) {
  if (!row.slaDueAt) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help whitespace-nowrap text-small text-text-subtle">Not started</span>
        </TooltipTrigger>
        <TooltipContent>
          An SLA clock starts when the file reaches a departmental stage. Timers arrive in Phase 9.
        </TooltipContent>
      </Tooltip>
    );
  }

  const days = row.slaDaysRemaining;
  const overdue = days !== null && days < 0;

  return (
    <div className="whitespace-nowrap">
      <StatusBadge kind="sla" status={row.slaStatus} />
      {days !== null && (
        <p className="mt-0.5 text-caption tabular-nums text-text-muted">
          {overdue ? `${Math.abs(days)}d over` : `${days}d left`}
        </p>
      )}
    </div>
  );
}

/**
 * The row's action.
 *
 * One primary button for whatever the file is actually waiting on, and a menu
 * for the rest. Actions belonging to later phases are shown DISABLED with the
 * reason rather than hidden — an LTP hunting for "Pay" learns that it appears
 * once a demand exists, instead of wondering whether the product has it.
 */
function RowActions({ row }: { row: ApplicationRow }) {
  const primary = primaryActionFor(row);

  // Drop any menu entry that would go where the button already goes. On a
  // draft "Continue" and "Edit" are the same destination, and offering both
  // invites the reader to hunt for a difference that is not there.
  const rest = actionsFor(row).filter(
    (a) => a.key !== primary.key && !(a.available && a.href === primary.href)
  );

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Button asChild size="sm" variant={primary.key === 'view' ? 'secondary' : 'primary'}>
        <Link href={primary.href}>{primary.label}</Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={`More actions for ${row.applicationNumber}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {rest.map((action) =>
            action.available ? (
              <DropdownMenuItem key={action.key} asChild>
                <Link href={action.href}>{action.label}</Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem key={action.key} disabled className="flex-col items-start gap-0">
                <span>{action.label}</span>
                <span className="text-caption text-text-subtle">{action.reason}</span>
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function formatRelative(value: string): string {
  const date = new Date(value);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatExact(value: string): string {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
