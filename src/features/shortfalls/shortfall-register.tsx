'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Search, X } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { Pagination } from '@/components/common/pagination';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { api, ApiCallError } from '@/features/applications/api';
import { stageName } from '@/lib/workflow';
import {
  SHORTFALL_FILTERS,
  SHORTFALL_FILTER_META,
  dueLabel,
  isOverdue,
  kindLabel,
} from '@/lib/shortfalls';
import { cn } from '@/lib/utils';
import type { ShortfallListPayload, ShortfallRow } from './types';

/**
 * The shortfall register, across applications.
 *
 * ── One list, two readers ────────────────────────────────────────────────
 *
 * An LTP sees everything asked of them, across every file they have filed. An
 * officer sees everything asked within their jurisdiction. It is the same
 * query with a different scope — and the same screen, because the questions
 * are the same shape: what is outstanding, whose move is it, and how long has
 * it been sitting there.
 *
 * The column that changes is the first one: the applicant does not need to be
 * told the applicant's name.
 */
export function ShortfallRegister({ initial }: { initial: ShortfallListPayload }) {
  const [data, setData] = React.useState(initial);
  const [filter, setFilter] = React.useState<string>(SHORTFALL_FILTERS.OPEN);
  const [query, setQuery] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter, page: String(page), summary: 'true' });
      if (search) params.set('q', search);
      setData(await api.get<ShortfallListPayload>(`/api/shortfalls?${params}`));
    } catch (error) {
      toast.error(error instanceof ApiCallError ? error.message : 'The register could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [filter, page, search]);

  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load();
  }, [load]);

  const isApplicant = data.isApplicant;

  const columns = React.useMemo<ColumnDef<ShortfallRow, unknown>[]>(() => {
    const base: ColumnDef<ShortfallRow, unknown>[] = [
      {
        id: 'shortfall',
        header: 'Shortfall',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/shortfalls/${row.original.id}`}
              className="font-medium text-primary hover:underline"
            >
              {row.original.shortfallNumber}
            </Link>
            <p className="truncate text-caption text-text-muted">{row.original.title}</p>
          </div>
        ),
      },
      {
        id: 'application',
        header: 'Application',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/applications/${row.original.application.id}`}
              className="text-text hover:underline"
            >
              {row.original.application.applicationNumber}
            </Link>
            {!isApplicant && (
              <p className="truncate text-caption text-text-muted">
                {row.original.application.applicantName}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'kind',
        header: 'Category',
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{kindLabel(row.original.kind)}</Badge>
            {row.original.mode === 'REPORTED' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Badge tone="info">Reported</Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Recorded and carried forward — the application moved on, but this still blocks
                  approval until it is settled.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        id: 'stage',
        header: 'Raised at',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-text">{stageName(row.original.raisedAtStageCode)}</p>
            <p className="truncate text-caption text-text-muted">{row.original.raisedByName}</p>
          </div>
        ),
      },
      {
        id: 'raised',
        header: 'Raised',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-text-muted">
            {new Date(row.original.raisedAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'due',
        header: 'Due',
        cell: ({ row }) => {
          const overdue = isOverdue(row.original.dueDate, row.original.status);
          return (
            <span
              className={cn(
                'whitespace-nowrap tabular-nums',
                overdue ? 'font-medium text-danger' : 'text-text-muted'
              )}
            >
              {dueLabel(row.original.dueDate)}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge kind="shortfall" status={row.original.status} />
            {row.original.attempts > 0 && (
              <span className="text-caption text-text-muted">
                {row.original.attempts} {row.original.attempts === 1 ? 'response' : 'responses'}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'action',
        header: 'Action',
        cell: ({ row }) => (
          <Button size="sm" variant={actionable(row.original, isApplicant) ? 'primary' : 'ghost'} asChild>
            <Link href={`/shortfalls/${row.original.id}`}>
              {actionable(row.original, isApplicant)
                ? isApplicant
                  ? 'Respond'
                  : 'Review'
                : 'Open'}
            </Link>
          </Button>
        ),
      },
    ];

    return base;
  }, [isApplicant]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {SHORTFALL_FILTER_META.map((meta) => {
          const count = data.counts?.[meta.key] ?? 0;
          const active = filter === meta.key;

          return (
            <Tooltip key={meta.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    setFilter(meta.key);
                    setPage(1);
                  }}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-2 rounded border px-3 py-1.5 text-small transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    active
                      ? 'border-primary bg-primary text-primary-text'
                      : 'border-border-strong bg-surface text-text hover:bg-surface-sunk'
                  )}
                >
                  {meta.label}
                  <span className={cn('tabular-nums', active ? 'text-primary-text/80' : 'text-text-muted')}>
                    {count}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{meta.description}</TooltipContent>
            </Tooltip>
          );
        })}

        <div className="relative ml-auto min-w-[16rem] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Reference, title or application"
            aria-label="Search shortfalls"
            className="pl-8 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data.rows}
        loading={loading}
        emptyTitle={
          filter === SHORTFALL_FILTERS.OPEN ? 'Nothing outstanding' : 'Nothing matches that filter'
        }
        emptyDescription={
          filter === SHORTFALL_FILTERS.OPEN
            ? isApplicant
              ? 'The department has not asked you for anything.'
              : 'No shortfall in your jurisdiction is waiting to be settled.'
            : SHORTFALL_FILTER_META.find((f) => f.key === filter)?.description
        }
      />

      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        totalPages={data.totalPages}
        onPageChange={setPage}
        disabled={loading}
        noun="shortfall"
      />
    </div>
  );
}

export { AlertTriangle };

/** True when this row is waiting on the person looking at it. */
const actionable = (row: ShortfallRow, isApplicant: boolean): boolean =>
  isApplicant ? row.turn === 'APPLICANT' : row.turn === 'OFFICER';
