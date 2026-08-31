'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Hand, Inbox, Search, TriangleAlert, X } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { Pagination } from '@/components/common/pagination';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { api, ApiCallError } from '@/features/applications/api';
import { statusMeta } from '@/lib/status';
import { priorityLabel, slaLabel, stageName, TASK_FILTER_META, TASK_FILTERS } from '@/lib/workflow';
import { cn } from '@/lib/utils';
import type { TaskListPayload, TaskRowView } from '@/features/workflow/types';

/**
 * The officer's inbox.
 *
 * ── One screen for every desk ────────────────────────────────────────────
 *
 * There is no TPA inbox and no Commissioner inbox. What an officer sees comes
 * from the tasks addressed to the roles they hold, and the columns are the same
 * questions at every desk: what is it, whose is it, how long has it been here,
 * and how long is left. A new stage adds rows to a table; it does not add a
 * page.
 *
 * ── Sorted for the person, not for the database ──────────────────────────
 *
 * Most urgent first, and among equals the file that has waited longest. An
 * officer working top-down is then working in the right order without having to
 * sort anything — which is the only ordering that survives a busy morning.
 */
export function TaskQueue({
  initial,
  currentUserId,
  canClaim,
}: {
  initial: TaskListPayload;
  currentUserId: string;
  canClaim: boolean;
}) {
  const router = useRouter();

  const [data, setData] = React.useState(initial);
  const [filter, setFilter] = React.useState<string>(TASK_FILTERS.ALL);
  const [query, setQuery] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [loading, setLoading] = React.useState(false);
  const [claiming, setClaiming] = React.useState<string | null>(null);

  // Debounced search: a queue of four hundred files should not re-query on
  // every keystroke, and 300ms is below the threshold at which typing feels
  // like it is being watched.
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
      const params = new URLSearchParams({ filter, page: String(page) });
      if (search) params.set('q', search);

      const sort = sorting[0];
      if (sort) {
        params.set('sort', sort.id);
        params.set('dir', sort.desc ? 'desc' : 'asc');
      }

      setData(await api.get<TaskListPayload>(`/api/workflow/tasks?${params}`));
    } catch (error) {
      toast.error(error instanceof ApiCallError ? error.message : 'The queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [filter, page, search, sorting]);

  const first = React.useRef(true);
  React.useEffect(() => {
    // The first render already has the server's payload; loading it again
    // would be a wasted round trip on every page view.
    if (first.current) {
      first.current = false;
      return;
    }
    void load();
  }, [load]);

  const claim = React.useCallback(
    async (task: TaskRowView) => {
      setClaiming(task.id);
      try {
        const result = await api.post<{ message: string }>(`/api/workflow/tasks/${task.id}/claim`);
        toast.success(result.message, { description: task.applicationNumber });
        await load();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof ApiCallError ? error.message : 'That did not work.');
        // Somebody else took it — reload so the row shows who has it now.
        await load();
      } finally {
        setClaiming(null);
      }
    },
    [load, router]
  );

  const columns = React.useMemo<ColumnDef<TaskRowView, unknown>[]>(
    () => [
      {
        id: 'application',
        header: 'Application',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/applications/${row.original.applicationId}?tab=workflow`}
              className="font-medium text-primary hover:underline"
            >
              {row.original.applicationNumber}
            </Link>
            <p className="truncate text-caption text-text-muted">{row.original.applicationType}</p>
          </div>
        ),
      },
      {
        id: 'applicant',
        header: 'Applicant',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-text">{row.original.applicantName}</p>
            <p className="truncate text-caption text-text-muted">{row.original.property}</p>
          </div>
        ),
      },
      {
        id: 'stage',
        header: 'Stage',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-text">{stageName(row.original.stageCode)}</p>
            <StatusBadge status={row.original.status} className="mt-1" />
          </div>
        ),
      },
      {
        id: 'received',
        accessorKey: 'receivedAt',
        header: 'Received',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-text-muted">
            {new Date(row.original.receivedAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'days',
        header: 'Days pending',
        cell: ({ row }) => (
          <span className="tabular-nums text-text">{row.original.daysPending}</span>
        ),
      },
      {
        id: 'due',
        header: 'SLA',
        cell: ({ row }) => {
          const { dueAt, slaStatus } = row.original;
          if (!dueAt) return <span className="text-text-subtle">—</span>;

          return (
            <div className="min-w-0">
              <p
                className={cn(
                  'whitespace-nowrap tabular-nums',
                  slaStatus === 'OVERDUE'
                    ? 'font-medium text-danger'
                    : slaStatus === 'DUE_SOON'
                      ? 'text-warning'
                      : 'text-text'
                )}
              >
                {slaLabel(dueAt)}
              </p>
              {slaStatus && (
                <Badge tone={statusMeta('sla', slaStatus).tone} className="mt-1">
                  {statusMeta('sla', slaStatus).label}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: 'priority',
        header: 'Priority',
        cell: ({ row }) => {
          const { label, tone } = priorityLabel(row.original.priority);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={tone}>{label}</Badge>
              {row.original.openShortfalls > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Badge tone="warning" className="gap-1">
                        <TriangleAlert className="size-3" aria-hidden />
                        {row.original.openShortfalls}
                      </Badge>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {row.original.openShortfalls === 1
                      ? '1 open shortfall travels with this file'
                      : `${row.original.openShortfalls} open shortfalls travel with this file`}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
      },
      {
        id: 'action',
        header: 'Action',
        cell: ({ row }) => {
          const task = row.original;

          if (task.claimedById && task.claimedById !== currentUserId) {
            return (
              <span className="whitespace-nowrap text-caption text-text-muted">
                With {task.claimedByName}
              </span>
            );
          }

          return (
            <div className="flex items-center gap-1.5">
              {canClaim && task.unclaimed && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={claiming === task.id}
                  onClick={() => claim(task)}
                >
                  <Hand />
                  Claim
                </Button>
              )}
              <Button size="sm" variant={task.mine && !task.unclaimed ? 'primary' : 'ghost'} asChild>
                <Link href={`/applications/${task.applicationId}?tab=workflow`}>Open</Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [canClaim, claim, claiming, currentUserId]
  );

  return (
    <div className="space-y-4">
      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {TASK_FILTER_META.map((meta) => {
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
                  <span
                    className={cn(
                      'tabular-nums',
                      active ? 'text-primary-text/80' : 'text-text-muted'
                    )}
                  >
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
            placeholder="Application number or applicant"
            aria-label="Search the queue"
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
        manualSorting
        sorting={sorting}
        onSortingChange={setSorting}
        emptyTitle={
          filter === TASK_FILTERS.ALL ? 'Nothing at your desk' : 'Nothing matches that filter'
        }
        emptyDescription={
          filter === TASK_FILTERS.ALL
            ? 'Files arrive here when they reach a stage your role works at.'
            : TASK_FILTER_META.find((f) => f.key === filter)?.description
        }
      />

      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        totalPages={data.totalPages}
        onPageChange={setPage}
        disabled={loading}
        noun="file"
      />
    </div>
  );
}

export { Inbox };
