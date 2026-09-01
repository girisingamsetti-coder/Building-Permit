'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  CreditCard,
  Download,
  Info,
  Lock,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { basisLabel, formatMoney, formatRate, variableLabel } from '@/lib/fees';
import { directionLabel, methodLabel, PAYMENT_STATUS_DESCRIPTIONS } from '@/lib/payments';
import { cn } from '@/lib/utils';
import { api, ApiCallError } from '@/features/applications/api';
import { submitToGateway } from './gateway-form';
import type { InitiateResponse, PayableDemandRow, PaymentRow, PaymentsPayload } from './types';

/**
 * The Payments tab.
 *
 * ── What this screen has to hold ───────────────────────────────────────
 *
 * SOMEBODY IS ABOUT TO PART WITH MONEY. So the amount is shown with its
 * breakdown beside the button, not behind a link — an applicant who has to
 * open another tab to check what they are paying for either does not, or does
 * not pay. And every attempt, including the failed ones, stays on the screen
 * with the gateway's own words against it, because "I paid and nothing
 * happened" is the call this page exists to prevent.
 *
 * ── Nothing here decides anything ──────────────────────────────────────
 *
 * The Pay button sends one field: a demand id. The gateway sends the payer
 * back to a return page which asks the SERVER whether it worked. No component
 * in this file can set a status, and a payer who edits the response in their
 * browser changes what they see and nothing else — the demand's `paidAmount`
 * moved, or it did not, inside a transaction they cannot reach.
 */
export function PaymentsTab({
  initial,
  canInitiate,
}: {
  initial: PaymentsPayload;
  /** Capability, from the server. The gates are inside `initial`. */
  canInitiate: boolean;
}) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState<PayableDemandRow | null>(null);

  React.useEffect(() => setData(initial), [initial]);

  const refresh = React.useCallback(async () => {
    try {
      setData(await api.get<PaymentsPayload>(`/api/applications/${initial.application.id}/payments`));
    } catch {
      // Keep the last good data on screen; the router refresh re-renders from
      // the server anyway.
    }
    router.refresh();
  }, [initial.application.id, router]);

  /**
   * Starts a payment and hands the payer to the gateway.
   *
   * Two shapes, because gateways come in two shapes: a hosted checkout is a
   * redirect, and PayU or CCAvenue need a signed form POSTed to them. Both are
   * built by the driver on the server — this function does not know which it
   * is dealing with, and does not construct a single gateway field.
   */
  async function pay(demand: PayableDemandRow) {
    setBusy(true);
    try {
      const started = await api.post<InitiateResponse>('/api/payments/initiate', {
        applicationFeeId: demand.id,
      });

      setConfirming(null);

      if (started.reused) {
        toast.info('Continuing the payment you already started', {
          description: `${started.payment.paymentRef} — you will not be charged twice.`,
        });
      }

      if (started.formPost) {
        submitToGateway(started.formPost);
        return;
      }

      if (started.redirectUrl) {
        window.location.assign(started.redirectUrl);
        return;
      }

      // A driver that returns neither is one whose checkout opens in the page
      // itself. Nothing supports that yet, so say so rather than appearing to
      // succeed.
      toast.error('This payment gateway is not supported by this screen yet', {
        description: `${started.gateway.name} returned no redirect. Nothing has been charged.`,
      });
      await refresh();
    } catch (error) {
      setConfirming(null);
      toast.error('The payment could not be started', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const payable = data.demands.filter((d) => d.blockedReason === null);
  const settled = data.payments.filter((p) => p.status === 'SUCCESS');
  const others = data.payments.filter((p) => p.status !== 'SUCCESS');

  return (
    <div className="space-y-4">
      <Summary summary={data.summary} status={data.application.status} />

      {/* ── The gate ───────────────────────────────────────────────────── */}
      {!data.canInitiate && data.blockedReason && payable.length === 0 && (
        <BlockedNotice reason={data.blockedReason} />
      )}

      {/* ── What is payable, with what it is for ───────────────────────── */}
      {payable.map((demand) => (
        <PayableCard
          key={demand.id}
          demand={demand}
          canPay={canInitiate && data.canInitiate}
          busy={busy}
          onPay={() => setConfirming(demand)}
        />
      ))}

      {/* ── Receipts ───────────────────────────────────────────────────── */}
      {settled.map((payment) => (
        <SettledCard key={payment.id} payment={payment} />
      ))}

      {/* ── Everything that did not work, kept ─────────────────────────── */}
      {others.length > 0 && <AttemptHistory payments={others} onChanged={refresh} />}

      {data.payments.length === 0 && payable.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CreditCard}
              title="Nothing to pay"
              description={
                data.blockedReason ??
                'A payment becomes possible once a fee demand has been raised against this application.'
              }
            />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Go to the payment gateway"
        description={
          confirming
            ? `You are about to pay ${formatMoney(confirming.balance)} against ${confirming.demandNumber}. ` +
              'You will be taken to the payment gateway to complete it. Do not close the window until it returns.'
            : ''
        }
        confirmLabel="Continue to the gateway"
        busy={busy}
        onConfirm={async () => {
          if (confirming) await pay(confirming);
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Notices
// ═══════════════════════════════════════════════════════════════════════════


function BlockedNotice({ reason }: { reason: string }) {
  return (
    <div className="rounded border border-border bg-surface-sunk px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Lock className="mt-0.5 size-5 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <p className="text-body font-medium text-text">No payment can be made right now</p>
          <p className="mt-0.5 text-small text-text-muted">{reason}</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The summary
// ═══════════════════════════════════════════════════════════════════════════

/** Demanded, paid, outstanding. The three numbers, and they add up on screen. */
function Summary({
  summary,
  status,
}: {
  summary: PaymentsPayload['summary'];
  status: string;
}) {
  const cleared = summary.balance <= 0 && summary.totalDemanded > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Figure label="Total demanded" value={summary.totalDemanded} />
      <Figure label="Paid" value={summary.totalPaid} tone={summary.totalPaid > 0 ? 'success' : 'neutral'} />
      <Figure
        label="Outstanding"
        value={summary.balance}
        tone={cleared ? 'success' : summary.balance > 0 ? 'warning' : 'neutral'}
        hint={cleared ? 'Nothing further is payable.' : undefined}
        badge={<StatusBadge status={status} />}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  tone = 'neutral',
  hint,
  badge,
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'warning';
  hint?: string;
  badge?: React.ReactNode;
}) {
  const bar = { neutral: 'bg-border-strong', success: 'bg-success', warning: 'bg-warning' }[tone];

  return (
    <div className="relative overflow-hidden rounded border border-border bg-surface p-4">
      <span className={cn('absolute inset-y-0 left-0 w-0.5', bar)} aria-hidden />
      <div className="pl-2">
        <p className="truncate text-caption font-medium uppercase tracking-wide text-text-muted">
          {label}
        </p>
        <p className="mt-1 text-h3 font-semibold tabular-nums text-text">{formatMoney(value)}</p>
        {hint && <p className="mt-0.5 text-caption text-text-muted">{hint}</p>}
        {badge && <div className="mt-2">{badge}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A demand waiting to be paid
// ═══════════════════════════════════════════════════════════════════════════

function PayableCard({
  demand,
  canPay,
  busy,
  onPay,
}: {
  demand: PayableDemandRow;
  canPay: boolean;
  busy: boolean;
  onPay: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{demand.demandNumber}</span>
            <StatusBadge kind="demand" status={demand.status} />
            {demand.type !== 'ORIGINAL' && <Badge tone="outline">{demand.type}</Badge>}
          </CardTitle>
          <CardDescription>
            Raised {formatDate(demand.issuedAt)}
            {demand.dueDate && <> · payable by {formatDate(demand.dueDate)}</>}
            {demand.paidAmount > 0 && <> · {formatMoney(demand.paidAmount)} already paid</>}
          </CardDescription>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-right">
            <p className="text-caption uppercase tracking-wide text-text-muted">Payable now</p>
            <p className="text-h3 font-semibold tabular-nums text-text">
              {formatMoney(demand.balance)}
            </p>
          </div>
          <Button variant="primary" onClick={onPay} loading={busy} disabled={!canPay}>
            <CreditCard className="size-4" />
            Pay now
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-0 p-0">
        <Breakdown demand={demand} />

        <p className="flex items-start gap-1.5 border-t border-border px-4 py-2.5 text-caption text-text-muted">
          <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
          Your payment is confirmed with the gateway by this system directly. Nothing is marked paid
          on the strength of your browser returning, so closing the window will not lose a payment
          that went through.
        </p>
      </CardContent>
    </Card>
  );
}

/** Component · basis · rate · amount, with the working underneath each line. */
function Breakdown({ demand }: { demand: PayableDemandRow }) {
  const lines = [...demand.charges, ...demand.adjustments];

  if (!lines.length) {
    return (
      <p className="border-t border-border px-4 py-3 text-small text-text-muted">
        This demand carries no itemised breakdown.
      </p>
    );
  }

  return (
    <div className="border-t border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>What you are paying for</TableHead>
            <TableHead>Basis</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                <span className="font-medium text-text">{line.componentName}</span>
                {line.calculationNote && (
                  <span className="block text-caption text-text-muted">{line.calculationNote}</span>
                )}
                {line.headOfAccount && (
                  <span className="block text-caption text-text-subtle">{line.headOfAccount}</span>
                )}
              </TableCell>
              <TableCell className="text-small text-text-muted">
                {basisLabel(line.basis)}
                {line.variableName && (
                  <span className="block text-caption text-text-subtle">
                    {variableLabel(line.variableName)}
                    {line.variableValue !== null && <> · {line.variableValue}</>}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right text-small tabular-nums text-text-muted">
                {formatRate(line.basis, line.rateApplied, line.variableName)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums text-text">
                {formatMoney(line.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <dl className="space-y-1 border-t border-border px-4 py-3 text-small">
        <Row label="Subtotal" value={demand.subtotal} />
        {demand.adjustmentTotal !== 0 && <Row label="Adjustments" value={demand.adjustmentTotal} />}
        <Row label="Demand total" value={demand.totalAmount} />
        {demand.paidAmount > 0 && <Row label="Already paid" value={-demand.paidAmount} />}
        <Row label="Payable now" value={demand.balance} strong />
      </dl>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4',
        strong && 'border-t border-border pt-2 text-body font-semibold text-text'
      )}
    >
      <dt className={cn(!strong && 'text-text-muted')}>{label}</dt>
      <dd className="tabular-nums">{formatMoney(value)}</dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A payment that went through
// ═══════════════════════════════════════════════════════════════════════════

function SettledCard({ payment }: { payment: PaymentRow }) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="size-5 text-success" aria-hidden />
            Payment received
            <StatusBadge kind="payment" status={payment.status} />
          </CardTitle>
          <CardDescription>
            {formatMoney(payment.amount)} paid on {formatDate(payment.settledAt)}
            {payment.method && <> by {methodLabel(payment.method)}</>}
          </CardDescription>
        </div>

        {payment.receipt && (
          <Button asChild variant="secondary">
            <a href={`/api/payments/${payment.id}/receipt`}>
              <Download className="size-4" />
              Download receipt
            </a>
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <dl className="grid gap-x-8 gap-y-2 border-t border-border px-4 py-3 text-small sm:grid-cols-2">
          {payment.receipt && (
            <Detail label="Receipt number" value={payment.receipt.receiptNumber} />
          )}
          <Detail label="Transaction ID" value={payment.gatewayTxnId ?? payment.paymentRef} />
          <Detail label="Our reference" value={payment.paymentRef} />
          {payment.bankRef && <Detail label="Bank reference" value={payment.bankRef} />}
          <Detail label="Gateway" value={payment.provider} />
          <Detail label="Attempt" value={`#${payment.attemptNo}`} />
        </dl>

        <Ledger payment={payment} />
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="truncate font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Everything that did not work
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Failed, cancelled, timed-out and in-flight attempts.
 *
 * Kept on screen rather than hidden. An applicant whose card was declined
 * needs to see that it was declined, when, and what the gateway said — and an
 * officer needs the same list when the applicant rings to say they paid.
 */
function AttemptHistory({
  payments,
  onChanged,
}: {
  payments: PaymentRow[];
  onChanged: () => void | Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment attempts</CardTitle>
        <CardDescription>
          Every attempt is kept, including the ones that did not complete. A retry is always a new
          attempt — nothing here is ever overwritten.
        </CardDescription>
      </CardHeader>

      <CardContent className="divide-y divide-border p-0">
        {payments.map((payment) => (
          <Attempt key={payment.id} payment={payment} onChanged={onChanged} />
        ))}
      </CardContent>
    </Card>
  );
}

function Attempt({
  payment,
  onChanged,
}: {
  payment: PaymentRow;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);

  async function check() {
    setBusy(true);
    try {
      const outcome = await api.post<{ status: string; message: string }>(
        `/api/payments/${payment.id}/verify`
      );
      toast.info(`Gateway says: ${outcome.status}`, { description: outcome.message });
      await onChanged();
    } catch (error) {
      toast.error('The gateway could not be reached', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium tabular-nums text-text">{payment.paymentRef}</span>
            <StatusBadge kind="payment" status={payment.status} />
            <Badge tone="outline">Attempt #{payment.attemptNo}</Badge>
          </p>
          <p className="mt-0.5 text-small text-text-muted">
            {formatMoney(payment.amount)} · started {formatDate(payment.initiatedAt)}
            {payment.settledAt && <> · closed {formatDate(payment.settledAt)}</>}
          </p>
          <p className="mt-1 text-small text-text">
            {payment.failureReason || PAYMENT_STATUS_DESCRIPTIONS[payment.status] || ''}
          </p>
        </div>

        {payment.isOpen && (
          <Button size="sm" variant="secondary" onClick={check} loading={busy}>
            <RotateCcw className="size-4" />
            Check with the gateway
          </Button>
        )}
      </div>

      <Ledger payment={payment} />
    </div>
  );
}

/**
 * The gateway ledger for one attempt.
 *
 * Every interaction, in order, from the append-only `payment_transactions`
 * table. This is what an officer reads when an applicant says "I paid" — and
 * it is unalterable, so what it says is what happened.
 */
function Ledger({ payment }: { payment: PaymentRow }) {
  const [open, setOpen] = React.useState(false);

  if (!payment.transactions.length) return null;

  return (
    <div className={cn('text-small', payment.status === 'SUCCESS' && 'border-t border-border px-4 py-2')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 py-1 text-caption text-text-muted hover:text-text"
      >
        <Info className="size-3.5" aria-hidden />
        {open ? 'Hide' : 'Show'} what happened with the gateway ({payment.transactions.length})
      </button>

      {open && (
        <ol className="mt-1 space-y-1.5 border-l border-border pl-3">
          {payment.transactions.map((txn) => (
            <li key={txn.id} className="text-caption">
              <span className="font-medium text-text">{directionLabel(txn.direction)}</span>
              <span className="text-text-muted"> · {formatDate(txn.occurredAt)}</span>
              <StatusBadge kind="payment" status={txn.status} className="ml-1.5" />
              {txn.message && <span className="block text-text-muted">{txn.message}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatDate(value: string | null | undefined): string {
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
