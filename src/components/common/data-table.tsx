'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from './empty-state';
import { cn } from '@/lib/utils';

/**
 * One table implementation behind every list in the product.
 *
 * Sorting is client-side by default, which is right for Phase 1's small
 * bounded lists (users, roles). A list that can exceed a page — applications,
 * tasks, the audit log — passes `manualSorting` with `sorting` and
 * `onSortingChange`, and sorts on the SERVER: without that, clicking a column
 * header reorders the twenty rows that happen to be on screen and silently
 * implies it reordered all four hundred, which is worse than not offering
 * sorting at all.
 */
export function DataTable<TData>({
  columns,
  data,
  loading = false,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyAction,
  onRowClick,
  className,
  manualSorting = false,
  sorting: controlledSorting,
  onSortingChange,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  className?: string;
  /** Sort on the server. `data` is then rendered in the order it arrived. */
  manualSorting?: boolean;
  /** Required when manualSorting — the sort the server actually applied. */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
}) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([]);
  const sorting = controlledSorting ?? internalSorting;

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    manualSorting,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (onSortingChange) onSortingChange(next);
      else setInternalSorting(next);
    },
    getCoreRowModel: getCoreRowModel(),
    // Applying a client sort on top of a server sort would reorder the page
    // against the ordering the query already imposed.
    ...(manualSorting ? {} : { getSortedRowModel: getSortedRowModel() }),
  });

  if (loading) {
    return (
      <div className={cn('rounded border border-border bg-surface', className)}>
        <div className="space-y-px p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className={cn('rounded border border-border bg-surface', className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <div className={cn('rounded border border-border bg-surface', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const dir = header.column.getIsSorted();

                return (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() || undefined }}
                    // aria-sort belongs on the column header cell — a button
                    // has an implicit role that does not support it.
                    aria-sort={
                      !sortable
                        ? undefined
                        : dir === 'asc'
                          ? 'ascending'
                          : dir === 'desc'
                            ? 'descending'
                            : 'none'
                    }
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 rounded hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {dir === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : dir === 'desc' ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={onRowClick ? 'cursor-pointer' : undefined}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
