'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { CalendarClock, Download, Search, X } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatBytes } from '@/lib/documents';
import { DOCUMENT_SORT_FIELDS } from '@/lib/schemas/documents';

/**
 * The cross-application document register.
 *
 * THE URL IS THE STATE, exactly as on the application register: every control
 * writes to the query string and the server re-renders from it, so a filtered
 * view can be sent to a colleague, the Back button behaves, and the counts in
 * the header can never drift from the rows below — they are two reads of the
 * same query.
 *
 * Sorting is `manualSorting` and happens in the database. Client-side sorting
 * here would reorder the twenty rows on screen and silently imply it had
 * reordered all four hundred.
 */

export type RegisterRow = {
  id: string;
  applicationId: string;
  applicationNumber: string;
  applicationStatus: string;
  applicationTypeName: string;
  applicantName: string;
  zone: { id: string; code: string; name: string } | null;
  code: string;
  name: string;
  category: string;
  status: string;
  isMandatory: boolean;
  versionNo: number;
  versionId: string | null;
  fileName: string;
  sizeBytes: number;
  scanStatus: string;
  uploadedAt: string;
  expiresOn: string | null;
  expired: boolean;
  satisfied: boolean;
  verifiedAt: string | null;
  verifyRemarks: string;
  updatedAt: string;
};

export type RegisterMeta = {
  documentTypes: Array<{ id: string; name: string }>;
  applicationTypes: Array<{ id: string; name: string }>;
  zones: Array<{ id: string; code: string; name: string }>;
  showZone: boolean;
};

const ANY = '__any__';

const BUCKETS = [
  { value: 'all', label: 'All documents' },
  { value: 'pending', label: 'Awaiting a decision' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expiring', label: 'Expiring soon' },
] as const;

export function DocumentRegister({
  rows,
  meta,
  total,
  page,
  totalPages,
}: {
  rows: RegisterRow[];
  meta: RegisterMeta;
  total: number;
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = React.useTransition();

  const [query, setQuery] = React.useState(searchParams.get('q') ?? '');

  // The URL is authoritative: a Back navigation must move the text box too.
  const urlQuery = searchParams.get('q') ?? '';
  React.useEffect(() => setQuery(urlQuery), [urlQuery]);

  const apply = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      // Any change to a filter invalidates the page number: page 4 of a
      // narrower result set is usually empty, which reads as "no results".
      if (!('page' in changes)) next.delete('page');
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    if (query === urlQuery) return;
    const handle = setTimeout(() => apply({ q: query || null }), 350);
    return () => clearTimeout(handle);
  }, [query, urlQuery, apply]);

  const sort = searchParams.get('sort') ?? 'updatedAt';
  const dir = searchParams.get('dir') ?? 'desc';

  const sorting = React.useMemo<SortingState>(
    () => [{ id: sort, desc: dir === 'desc' }],
    [sort, dir]
  );

  const onSortingChange = React.useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      if (!first) return;
      if (!(DOCUMENT_SORT_FIELDS as readonly string[]).includes(first.id)) return;
      apply({ sort: first.id, dir: first.desc ? 'desc' : 'asc' });
    },
    [apply, sorting]
  );

  const columns = React.useMemo<ColumnDef<RegisterRow, unknown>[]>(
    () => [
      {
        id: 'documentType',
        accessorKey: 'documentType',
        header: 'Document',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text">{row.original.name}</span>
              {row.original.isMandatory && <Badge tone="neutral">Required</Badge>}
            </div>
            <p className="truncate text-caption text-text-muted">
              v{row.original.versionNo} · {row.original.fileName}
              {row.original.sizeBytes > 0 && ` · ${formatBytes(row.original.sizeBytes)}`}
            </p>
          </div>
        ),
      },
      {
        id: 'applicationNumber',
        accessorKey: 'applicationNumber',
        header: 'Application',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/applications/${row.original.applicationId}?tab=documents`}
              className="font-medium text-text hover:text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.applicationNumber}
            </Link>
            <p className="truncate text-caption text-text-muted">
              {row.original.applicantName || row.original.applicationTypeName}
              {meta.showZone && row.original.zone ? ` · ${row.original.zone.code}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <div className="space-y-1">
            <StatusBadge status={row.original.status} />
            {row.original.expired && (
              <p className="flex items-center gap-1 text-caption text-danger">
                <CalendarClock className="size-3" />
                Expired
              </p>
            )}
            {!row.original.expired && row.original.expiresOn && (
              <p className="text-caption text-text-muted">
                valid to {formatDate(row.original.expiresOn)}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'updatedAt',
        accessorKey: 'updatedAt',
        header: 'Last change',
        cell: ({ row }) => (
          <span className="text-small text-text-muted">{formatDate(row.original.updatedAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.versionId ? (
            <div className="flex justify-end">
              <Button asChild size="sm" variant="ghost">
                <a
                  href={`/api/documents/versions/${row.original.versionId}/download`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="size-4" />
                  Download
                </a>
              </Button>
            </div>
          ) : null,
      },
    ],
    [meta.showZone]
  );

  const bucket = searchParams.get('bucket') ?? 'all';
  const hasFilters =
    Boolean(searchParams.get('q')) ||
    bucket !== 'all' ||
    Boolean(searchParams.get('documentTypeId')) ||
    Boolean(searchParams.get('applicationTypeId')) ||
    Boolean(searchParams.get('zoneId')) ||
    searchParams.get('mandatoryOnly') === 'true';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="q" className="min-w-[16rem] flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Application number, applicant or document"
              className="pl-9"
            />
          </div>
        </Field>

        <Field label="Show" htmlFor="bucket" className="w-52">
          <Select value={bucket} onValueChange={(v) => apply({ bucket: v === 'all' ? null : v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUCKETS.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Document" htmlFor="documentTypeId" className="w-56">
          <Select
            value={searchParams.get('documentTypeId') ?? ANY}
            onValueChange={(v) => apply({ documentTypeId: v === ANY ? null : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any document</SelectItem>
              {meta.documentTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {meta.showZone && meta.zones.length > 0 && (
          <Field label="Zone" htmlFor="zoneId" className="w-40">
            <Select
              value={searchParams.get('zoneId') ?? ANY}
              onValueChange={(v) => apply({ zoneId: v === ANY ? null : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any zone</SelectItem>
                {meta.zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {hasFilters && (
          <Button variant="ghost" onClick={() => startTransition(() => router.push(pathname))}>
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        manualSorting
        sorting={sorting}
        onSortingChange={onSortingChange}
        onRowClick={(row) =>
          router.push(`/applications/${row.applicationId}?tab=documents`)
        }
        emptyTitle={hasFilters ? 'Nothing matches those filters' : 'No documents yet'}
        emptyDescription={
          hasFilters
            ? 'Widen the search, or clear the filters to see everything.'
            : 'Documents appear here once an applicant has uploaded one.'
        }
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-small text-text-muted">
          <span>
            Page {page} of {totalPages} · {total} document{total === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => apply({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => apply({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
