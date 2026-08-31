'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  Calculator,
  FileWarning,
  Info,
  Lock,
  Receipt,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { basisLabel, formatMoney, formatRate, variableLabel, ROUNDING_LABELS } from '@/lib/fees';
import type { RoundingRule } from '@/lib/fees';
import { cn } from '@/lib/utils';
import { api, ApiCallError } from '@/features/applications/api';
import type { DemandRow, FeeLineRow, FeesPayload, PreviewCalculation } from './types';

/**
 * The Fees tab.
 *
 * ── The property this screen exists to hold ────────────────────────────
 *
 * AN OFFICER MUST NEVER HAVE TO ASK HOW A NUMBER WAS REACHED. So every line
 * carries its basis, the quantity it was charged on, the rate applied and the
 * working — "620 × 5.00", "100 @ 20 + 200 @ 30 + 320 @ 45", "10% of
 * DEVELOPMENT_CHARGE (22,400.00)" — and the three totals underneath sum
 * visibly: Subtotal, Adjustments, Total Payable.
 *
 * ── Issued demands are read, never recalculated ────────────────────────
 *
 * An issued demand renders from its own frozen line items. The live preview is
 * shown only while no demand exists. Putting a recalculated figure next to an
 * issued demand that says something different is precisely how confidence in
 * the number is lost, and it is the reason `getFees` builds the preview only
 * when there is nothing issued to contradict.
 */
export function FeesTab({
  initial,
  canGenerate,
}: {
  initial: FeesPayload;
  /** Capability, from the server. The gates are inside `initial`. */
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [generating, setGenerating] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<DemandRow | null>(null);

  React.useEffect(() => setData(initial), [initial]);

  const refresh = React.useCallback(async () => {
    try {
      setData(await api.get<FeesPayload>(`/api/applications/${initial.application.id}/fees`));
    } catch {
      // Keep the last good data on screen; the router refresh re-renders from
      // the server anyway.
    }
    router.refresh();
  }, [initial.application.id, router]);

  async function generate() {
    setGenerating(true);
    try {
      const demand = await api.post<DemandRow>(
        `/api/applications/${initial.application.id}/fees/generate`
      );
      setConfirming(false);
      toast.success('Fee demand generated', {
        description: `${demand.demandNumber} — ${formatMoney(demand.totalAmount)} payable.`,
      });
      await refresh();
    } catch (error) {
      setConfirming(false);
      const message = error instanceof ApiCallError ? error.message : 'Try again shortly.';
      // The guard returns one detail per missing document. Showing them is the
      // whole point of the gate — "blocked" without a list is a dead end.
      const details =
        error instanceof ApiCallError && error.details.length
          ? error.details.map((d) => d.message).join('; ')
          : '';

      toast.error('The fee could not be generated', {
        description: details ? `${message} ${details}` : message,
      });
    } finally {
      setGenerating(false);
    }
  }

  const live = data.demands.filter((d) => d.status !== 'CANCELLED');
  const cancelled = data.demands.filter((d) => d.status === 'CANCELLED');

  return (
    <div className="space-y-4">
      {/* ── The gate ───────────────────────────────────────────────────── */}
      {!data.canGenerate && data.generateBlockedReason && live.length === 0 && (
        <BlockedNotice reason={data.generateBlockedReason} missing={data.documents.missing} />
      )}

      {/* ── Generate ───────────────────────────────────────────────────── */}
      {canGenerate && data.canGenerate && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface px-4 py-3">
          <div>
            <p className="text-small font-medium text-text">Ready to raise the demand</p>
            <p className="text-caption text-text-muted">
              Every required document is in. The demand is issued at the rates in force today and
              cannot be edited afterwards.
            </p>
          </div>
          <Button variant="primary" onClick={() => setConfirming(true)} loading={generating}>
            <Receipt className="size-4" />
            Generate the fee
          </Button>
        </div>
      )}

      {/* ── Issued demands ─────────────────────────────────────────────── */}
      {live.map((demand) => (
        <DemandCard
          key={demand.id}
          demand={demand}
          canCancel={canGenerate}
          onCancel={() => setCancelling(demand)}
        />
      ))}

      {/* ── Preview ────────────────────────────────────────────────────── */}
      {live.length === 0 && data.preview && <PreviewCard preview={data.preview} />}

      {live.length === 0 && !data.preview && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Calculator}
              title="No fee has been calculated"
              description={
                data.generateBlockedReason ??
                'A demand is raised once every required document is in.'
              }
            />
          </CardContent>
        </Card>
      )}

      {/* ── Cancelled demands — kept, never hidden ─────────────────────── */}
      {cancelled.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cancelled demands</CardTitle>
            <CardDescription>
              Kept on the record with the reason each was withdrawn. A demand is never edited — a
              correction is always a new demand.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Demand</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cancelled.map((demand) => (
                  <TableRow key={demand.id}>
                    <TableCell className="font-medium tabular-nums text-text">
                      {demand.demandNumber}
                    </TableCell>
                    <TableCell className="text-small text-text-muted">
                      {formatDate(demand.issuedAt ?? demand.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-[36ch] text-small text-text-muted">
                      {demand.cancelReason}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-small text-text-muted line-through">
                      {formatMoney(demand.totalAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Generate the fee demand?"
        description={
          data.preview
            ? `${formatMoney(data.preview.total)} payable, under ${data.preview.structure.code} v${data.preview.structure.version}.`
            : data.application.applicationNumber
        }
        consequence={
          <>
            The demand is issued immediately and cannot be edited. The rates and the values used are
            frozen onto it, so a later change to the fee schedule will not alter it. Correcting a
            demand means cancelling it, with a reason, and raising another.
          </>
        }
        confirmLabel="Generate the demand"
        busy={generating}
        onConfirm={generate}
      />

      <CancelDialog
        demand={cancelling}
        onClose={() => setCancelling(null)}
        onDone={() => {
          setCancelling(null);
          void refresh();
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The gate
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Why no fee can be raised, and exactly what would change that.
 *
 * The missing documents are NAMED. "Documents incomplete" tells an applicant
 * they have a problem without telling them what to do about it, which converts
 * a two-minute upload into a telephone call.
 */
function BlockedNotice({
  reason,
  missing,
}: {
  reason: string;
  missing: Array<{ code: string; name: string; reason: string }>;
}) {
  return (
    <div className="rounded border border-warning/30 bg-warning-bg px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Lock className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="text-body font-medium text-warning">The fee cannot be generated yet</p>
          <p className="mt-0.5 text-small text-text-muted">{reason}</p>

          {missing.length > 0 && (
            <ul className="mt-2 space-y-1">
              {missing.map((item) => (
                <li key={item.code} className="flex items-start gap-2 text-small text-text">
                  <X className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                  <span>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-text-muted"> — {item.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// An issued demand
// ═══════════════════════════════════════════════════════════════════════════

function DemandCard({
  demand,
  canCancel,
  onCancel,
}: {
  demand: DemandRow;
  canCancel: boolean;
  onCancel: () => void;
}) {
  const cancellable = canCancel && demand.paidAmount === 0 && demand.status === 'ISSUED';

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{demand.demandNumber}</span>
            <StatusBadge kind="demand" status={demand.status} />
            {demand.type !== 'ORIGINAL' && <Badge tone="outline">{demand.type}</Badge>}
          </CardTitle>
          <CardDescription>
            Raised {formatDate(demand.issuedAt ?? demand.createdAt)}
            {demand.generatedByName && <> by {demand.generatedByName}</>} under{' '}
            {demand.feeStructureCode} v{demand.feeStructureVersion}
            {demand.dueDate && <> · payable by {formatDate(demand.dueDate)}</>}
          </CardDescription>
        </div>

        {cancellable && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <Ban className="size-4" />
            Cancel demand
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3 p-0">
        <BreakdownTable charges={demand.charges} adjustments={demand.adjustments} />

        <Totals
          subtotal={demand.subtotal}
          adjustmentTotal={demand.adjustmentTotal}
          total={demand.totalAmount}
          paid={demand.paidAmount}
          balance={demand.balance}
          roundingRule={demand.roundingRule}
          showPaid={demand.paidAmount > 0}
        />

        {/*
          The frozen inputs. This is what makes §9 real: a demand from March
          stays explainable in November after two rate revisions, because the
          values it was computed from travel with it.
        */}
        <FrozenInputs
          inputs={demand.calculationInputs}
          structure={`${demand.feeStructureCode} v${demand.feeStructureVersion}`}
        />
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The preview
// ═══════════════════════════════════════════════════════════════════════════

function PreviewCard({ preview }: { preview: PreviewCalculation }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          What the fee will be
          <Badge tone="info">Estimate</Badge>
          {preview.structure.isPlaceholder && <Badge tone="warning">Placeholder rates</Badge>}
        </CardTitle>
        <CardDescription>
          Calculated at today’s rates under {preview.structure.code} v{preview.structure.version}.
          Nothing has been raised against this application yet — the figure is fixed only when the
          demand is generated.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 p-0">
        <BreakdownTable charges={preview.lines} adjustments={preview.adjustments} />

        <Totals
          subtotal={preview.subtotal}
          adjustmentTotal={preview.adjustmentTotal}
          total={preview.total}
          paid={0}
          balance={preview.total}
          roundingRule={preview.structure.roundingRule}
          showPaid={false}
        />

        {/* What was NOT charged, and why. "Why am I not paying the high-rise
            surcharge?" deserves an answer, and silence is not one. */}
        {preview.skipped.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-caption uppercase tracking-wide text-text-muted">
              <Info className="size-3.5" aria-hidden />
              Not charged on this application
            </p>
            <ul className="space-y-0.5">
              {preview.skipped.map((item) => (
                <li key={item.code} className="text-caption text-text-muted">
                  <span className="text-text">{item.name}</span> — {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The breakdown
// ═══════════════════════════════════════════════════════════════════════════

/** Fee Component · Basis · Rate · Amount, with the working underneath each. */
function BreakdownTable({
  charges,
  adjustments,
}: {
  charges: FeeLineRow[];
  adjustments: FeeLineRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Fee component</TableHead>
            <TableHead>Basis</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {charges.map((line, index) => (
            <LineRow key={line.id ?? `${line.code}-${index}`} line={line} />
          ))}

          {adjustments.length > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="bg-surface-sunk py-1.5">
                <span className="text-caption uppercase tracking-wide text-text-muted">
                  Adjustments
                </span>
              </TableCell>
            </TableRow>
          )}

          {adjustments.map((line, index) => (
            <LineRow key={line.id ?? `${line.code}-${index}`} line={line} adjustment />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LineRow({ line, adjustment = false }: { line: FeeLineRow; adjustment?: boolean }) {
  const name = line.name ?? line.componentName ?? line.code;
  const code = line.code ?? line.componentCode ?? '';
  const note = line.note ?? line.calculationNote ?? '';

  return (
    <TableRow>
      <TableCell>
        <p className="text-small font-medium text-text">{name}</p>
        <p className="text-caption text-text-subtle">{code}</p>
        {line.headOfAccount && (
          <p className="text-caption text-text-subtle">Head: {line.headOfAccount}</p>
        )}
      </TableCell>

      <TableCell>
        <span className="text-small text-text-muted">{basisLabel(line.basis)}</span>
        {/* The working. This is the column that means nobody has to ask. */}
        {note && <p className="mt-0.5 max-w-[40ch] text-caption text-text-subtle">{note}</p>}
      </TableCell>

      <TableCell className="whitespace-nowrap text-right">
        <span className="text-small tabular-nums text-text-muted">
          {formatRate(line.basis, line.rateApplied, line.variableName)}
        </span>
        {line.variableName && line.variableValue !== null && (
          <p className="text-caption tabular-nums text-text-subtle">
            {variableLabel(line.variableName)}: {line.variableValue}
          </p>
        )}
      </TableCell>

      <TableCell
        className={cn(
          'whitespace-nowrap text-right text-small font-medium tabular-nums',
          adjustment && line.amount < 0 ? 'text-success' : 'text-text'
        )}
      >
        {formatMoney(line.amount)}
      </TableCell>
    </TableRow>
  );
}

/**
 * Subtotal, Adjustments, Total Payable.
 *
 * The three sum visibly on the page. That is deliberate: a total nobody can
 * check by eye against the rows above it is a total that gets queried, and a
 * queried demand is a demand that does not get paid.
 */
function Totals({
  subtotal,
  adjustmentTotal,
  total,
  paid,
  balance,
  roundingRule,
  showPaid,
}: {
  subtotal: number;
  adjustmentTotal: number;
  total: number;
  paid: number;
  balance: number;
  roundingRule: string;
  showPaid: boolean;
}) {
  const rounding = ROUNDING_LABELS[roundingRule as RoundingRule] ?? roundingRule;

  return (
    <div className="border-t border-border px-4 py-3">
      <dl className="ml-auto max-w-sm space-y-1.5">
        <Row label="Subtotal" value={formatMoney(subtotal)} />
        <Row
          label="Adjustments"
          value={formatMoney(adjustmentTotal)}
          muted={adjustmentTotal === 0}
          tone={adjustmentTotal < 0 ? 'success' : undefined}
        />

        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-1.5">
          <dt className="flex items-center gap-1.5 text-body font-medium text-text">
            Total payable
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-text-subtle">
                  <Info className="size-3.5" aria-hidden />
                  <span className="sr-only">How this total is rounded</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>Rounded to the {rounding.toLowerCase()}.</TooltipContent>
            </Tooltip>
          </dt>
          <dd className="text-display tabular-nums text-text">{formatMoney(total)}</dd>
        </div>

        {showPaid && (
          <>
            <Row label="Paid" value={formatMoney(paid)} tone="success" />
            <Row label="Balance" value={formatMoney(balance)} />
          </>
        )}
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  muted = false,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: 'success';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-small text-text-muted">{label}</dt>
      <dd
        className={cn(
          'text-small tabular-nums',
          tone === 'success' ? 'text-success' : muted ? 'text-text-subtle' : 'text-text'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Frozen inputs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The exact values the demand was calculated from.
 *
 * Collapsed by default — most people never need it — but present, because the
 * one time somebody does need it, they need ALL of it. Recording the inputs
 * next to the output is what makes an old demand explainable without
 * re-running anything, and re-running anything is precisely what must not
 * happen to an issued demand.
 */
function FrozenInputs({
  inputs,
  structure,
}: {
  inputs: Record<string, number | string>;
  structure: string;
}) {
  const entries = Object.entries(inputs ?? {}).filter(([, value]) => value !== '' && value !== 0);
  if (!entries.length) return null;

  return (
    <details className="border-t border-border">
      <summary className="cursor-pointer px-4 py-2.5 text-caption text-text-muted hover:text-text">
        The values this demand was calculated from ({structure})
      </summary>
      <dl className="grid gap-x-6 gap-y-2 px-4 pb-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-caption uppercase tracking-wide text-text-muted">
              {variableLabel(key)}
            </dt>
            <dd className="truncate text-small tabular-nums text-text">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Cancellation
// ═══════════════════════════════════════════════════════════════════════════

function CancelDialog({
  demand,
  onClose,
  onDone,
}: {
  demand: DemandRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (demand) setReason('');
  }, [demand]);

  async function cancel() {
    if (!demand) return;
    setBusy(true);

    try {
      await api.post(`/api/fees/${demand.id}/cancel`, { reason });
      toast.success('Demand cancelled', { description: demand.demandNumber });
      onDone();
    } catch (error) {
      toast.error('Could not cancel that demand', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={demand !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {demand && (
          <>
            <DialogHeader>
              <DialogTitle>Cancel {demand.demandNumber}?</DialogTitle>
              <DialogDescription>
                {formatMoney(demand.totalAmount)}, raised {formatDate(demand.issuedAt ?? demand.createdAt)}.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-3">
              <div className="flex items-start gap-2 rounded border border-warning/30 bg-warning-bg px-3 py-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="text-small text-text">
                  The demand stays on the record, marked cancelled, with this reason attached. The
                  application returns to the document stage so a corrected demand can be raised.
                </p>
              </div>

              <Field
                label="Reason"
                htmlFor="cancel-reason"
                required
                hint="The applicant sees this. Say what was wrong with the demand."
              >
                <Textarea
                  id="cancel-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder="Raised against the wrong built-up area."
                />
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Keep the demand
              </Button>
              <Button
                variant="destructive"
                onClick={cancel}
                loading={busy}
                disabled={busy || reason.trim().length === 0}
              >
                <Ban className="size-4" />
                Cancel the demand
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export { FileWarning };
