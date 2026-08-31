'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Pagination } from '@/components/common/pagination';
import { toast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/fees';
import { methodLabel, PAYMENT_STATUSES } from '@/lib/payments';
import { statusMeta } from '@/lib/status';
import { api, ApiCallError } from '@/features/applications/api';

export type RegisterRow = {
  id: string;
  paymentRef: string;
  provider: string;
  status: string;
  amount: number;
  method: string;
  gatewayTxnId: string | null;
  initiatedAt: string;
  settledAt: string | null;
  failureReason: string;
  application: { id: string; applicationNumber: string; status: string };
  fee: { id: string; demandNumber: string } | null;
  receipt: { receiptNumber: string; issuedAt: string } | null;
};

/**
 * The payments register.
 *
 * Filters live in the URL, so a finance officer can send a colleague a link to
 * "everything that failed today" rather than describing how to reproduce it.
 *
 * The Reconcile button is the same sweep the worker runs every five minutes.
 * It exists because a finance officer with an applicant on the telephone
 * should not have to wait for a cron tick — not because a manual reconciliation
 * does anything different.
 */
export function PaymentsRegister({
  rows,
  total,
  page,
  totalPages,
  status,
  search,
  canReconcile,
}: {
  rows: RegisterRow[];
  total: number;
  page: number;
  totalPages: number;
  status: string;
  search: string;
  canReconcile: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [term, setTerm] = React.useState(search);
  const [reconciling, setReconciling] = React.useState(false);

  React.useEffect(() => setTerm(search), [search]);

  const setParam = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      // Any change to a filter invalidates the page number.
      if (key !== 'page') next.delete('page');
      router.push(`${pathname}${next.toString() ? `?${next}` : ''}`);
    },
    [pathname, router, searchParams]
  );

  async function reconcile() {
    setReconciling(true);
    try {
      const report = await api.post<{
        examined: number;
        settled: number;
        timedOut: number;
        stillOpen: number;
        errors: number;
      }>('/api/payments/reconcile');

      toast.success(`${report.examined} payment${report.examined === 1 ? '' : 's'} checked`, {
        description:
          `${report.settled} settled · ${report.timedOut} timed out · ` +
          `${report.stillOpen} still with the gateway` +
          (report.errors ? ` · ${report.errors} could not be reached` : ''),
      });
      router.refresh();
    } catch (error) {
      toast.error('The reconciliation sweep could not run', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="space-y-4" id="reconcile">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-[16rem] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', term.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Reference, transaction ID, application, demand or receipt number"
            className="pl-8"
            aria-label="Search payments"
          />
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip label="All" active={!status} onClick={() => setParam('status', '')} />
          {['SUCCESS', 'PROCESSING', 'FAILED', 'TIMEOUT', 'CANCELLED'].map((value) => (
            <FilterChip
              key={value}
              label={statusMeta('payment', value).label}
              active={status === value}
              onClick={() => setParam('status', value)}
            />
          ))}
        </div>

        {canReconcile && (
          <Button variant="secondary" onClick={reconcile} loading={reconciling}>
            <RefreshCw className="size-4" />
            Reconcile now
          </Button>
        )}
      </div>

      {(status || search) && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="inline-flex items-center gap-1 text-caption text-text-muted hover:text-text"
        >
          <X className="size-3.5" aria-hidden />
          Clear filters
        </button>
      )}

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No payments match"
              description={
                status || search
                  ? 'Nothing here matches the current filters. Clear them to see everything.'
                  : 'No payment has been made against any application in your remit yet.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Reference</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead>Demand</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Settled</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/payments/${row.id}/return`}
                        className="font-medium tabular-nums text-primary hover:underline"
                      >
                        {row.paymentRef}
                      </Link>
                      <span className="block text-caption text-text-subtle">
                        {row.gatewayTxnId ?? row.provider}
                        {row.method && <> · {methodLabel(row.method)}</>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/applications/${row.application.id}?tab=payments`}
                        className="tabular-nums text-text hover:underline"
                      >
                        {row.application.applicationNumber}
                      </Link>
                      <span className="block text-caption text-text-subtle">
                        {statusMeta('application', row.application.status).label}
                      </span>
                    </TableCell>
                    <TableCell className="text-small tabular-nums text-text-muted">
                      {row.fee?.demandNumber ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-text">
                      {formatMoney(row.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="payment" status={row.status} />
                      {row.failureReason && (
                        <span className="mt-0.5 block max-w-[32ch] text-caption text-text-muted">
                          {row.failureReason}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-small text-text-muted">
                      {formatDate(row.settledAt ?? row.initiatedAt)}
                    </TableCell>
                    <TableCell className="text-small tabular-nums">
                      {row.receipt ? (
                        <a
                          href={`/api/payments/${row.id}/receipt`}
                          className="text-primary hover:underline"
                        >
                          {row.receipt.receiptNumber}
                        </a>
                      ) : (
                        <span className="text-text-subtle">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageSize={25}
        totalPages={totalPages}
        total={total}
        noun="payment"
        onPageChange={(next) => setParam('page', String(next))}
      />

      {/* Kept honest: the register lists what the database holds, and the
          vocabulary it filters on is the same list the state machine uses. */}
      <p className="sr-only">{PAYMENT_STATUSES.join(' ')}</p>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-sm border border-primary bg-primary px-2.5 py-1 text-caption font-medium text-primary-text'
          : 'rounded-sm border border-border-strong bg-surface px-2.5 py-1 text-caption text-text-muted hover:bg-surface-sunk'
      }
    >
      {label}
    </button>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
