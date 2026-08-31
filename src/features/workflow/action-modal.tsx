'use client';

import * as React from 'react';
import { ArrowRight, Plus, TriangleAlert, X } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/common/status-badge';
import { stageName } from '@/lib/workflow';
import { cn } from '@/lib/utils';
import type { ActionOption } from './types';

/**
 * The action modal — the last thing an officer sees before a file moves.
 *
 * ── It always answers the same four questions ────────────────────────────
 *
 *   Which application?   Where is it now?   What am I about to do?
 *   And where will it be afterwards?
 *
 * The fourth is the one usually missing from systems like this, and it is the
 * one an officer most needs: "Forward" means nothing on its own, and "Forward
 * → Zonal Joint Director" means everything. It comes from the transition row,
 * not from anything this component knows.
 *
 * ── Remarks are required where the workflow says so ──────────────────────
 *
 * Not where this file says so. `action.requiresRemarks` came from the action's
 * own configuration, and the server enforces the same rule again — the
 * asterisk here is a courtesy, not the control.
 */

export type ActionSubmission = {
  remarks: string;
  shortfall?: {
    title: string;
    description: string;
    items: Array<{ description: string; amount?: number | null }>;
  };
};

const KIND_LABELS: Record<string, string> = {
  DOCUMENT: 'Documents required',
  FEE: 'Additional fee payable',
  TECHNICAL: 'Drawing correction required',
  CLARIFICATION: 'Clarification required',
};

export function ActionModal({
  action,
  applicationNumber,
  currentStageCode,
  currentStatus,
  submitting,
  onClose,
  onSubmit,
}: {
  /** Null closes the modal. The open action IS the state. */
  action: ActionOption | null;
  applicationNumber: string;
  currentStageCode: string;
  currentStatus: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: ActionSubmission) => void;
}) {
  const [remarks, setRemarks] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [items, setItems] = React.useState<Array<{ description: string; amount: string }>>([
    { description: '', amount: '' },
  ]);
  const [touched, setTouched] = React.useState(false);

  // Reset every time a different action is opened, so yesterday's remarks
  // cannot be submitted against today's decision.
  React.useEffect(() => {
    setRemarks('');
    setTitle('');
    setItems([{ description: '', amount: '' }]);
    setTouched(false);
  }, [action?.code]);

  if (!action) return null;

  const isFee = action.shortfall?.kind === 'FEE';
  const needsShortfall = action.shortfall !== null;
  const filledItems = items.filter((i) => i.description.trim().length > 0);

  const remarksMissing = action.requiresRemarks && remarks.trim().length === 0;
  const itemsMissing = needsShortfall && filledItems.length === 0;
  const amountMissing = isFee && !filledItems.some((i) => Number(i.amount) > 0);

  const blocked = remarksMissing || itemsMissing || amountMissing;

  function submit() {
    setTouched(true);
    if (blocked) return;

    onSubmit({
      remarks: remarks.trim(),
      ...(needsShortfall
        ? {
            shortfall: {
              title: title.trim() || KIND_LABELS[action!.shortfall!.kind] || 'Shortfall',
              description: remarks.trim(),
              items: filledItems.map((i) => ({
                description: i.description.trim(),
                amount: isFee && Number(i.amount) > 0 ? Number(i.amount) : null,
              })),
            },
          }
        : {}),
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>{applicationNumber}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* ── Where it is, and where it goes ───────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 rounded border border-border bg-surface-sunk px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-caption text-text-muted">Now at</p>
              <p className="truncate text-small font-medium text-text">{stageName(currentStageCode)}</p>
              <StatusBadge status={currentStatus} className="mt-1" />
            </div>

            <ArrowRight className="size-4 shrink-0 text-text-subtle" aria-hidden />

            <div className="min-w-0">
              <p className="text-caption text-text-muted">Then at</p>
              <p className="truncate text-small font-medium text-text">
                {action.toStageCode ? stageName(action.toStageCode) : action.toStageName}
              </p>
              <StatusBadge status={action.toStatus} className="mt-1" />
            </div>
          </div>

          {action.confirmText && (
            <p className="flex items-start gap-2 rounded border border-warning/40 bg-warning-bg px-3 py-2 text-small text-text">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              {action.confirmText}
            </p>
          )}

          {/* ── The shortfall being raised ───────────────────────────────── */}
          {needsShortfall && (
            <div className="space-y-3 rounded border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-small font-medium text-text">
                  {KIND_LABELS[action.shortfall!.kind] ?? 'Shortfall'}
                </p>
                <Badge tone={action.shortfall!.mode === 'BLOCKING' ? 'warning' : 'info'}>
                  {action.shortfall!.mode === 'BLOCKING'
                    ? 'Application waits with the applicant'
                    : 'Travels with the file'}
                </Badge>
              </div>

              <Field label="Heading" htmlFor="shortfall-title" hint="Optional. A default is used if you leave it blank.">
                <Input
                  id="shortfall-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={KIND_LABELS[action.shortfall!.kind] ?? ''}
                  maxLength={200}
                />
              </Field>

              <div className="space-y-2">
                <p className="text-small font-medium text-text">
                  {isFee ? 'What is payable' : 'What is required'}
                  <span className="ml-1 text-danger" aria-hidden>
                    *
                  </span>
                </p>

                {items.map((item, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Input
                      aria-label={`Item ${index + 1}`}
                      value={item.description}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it, i) => (i === index ? { ...it, description: e.target.value } : it))
                        )
                      }
                      placeholder={isFee ? 'Betterment charge — balance' : 'Current encumbrance certificate'}
                      maxLength={500}
                    />

                    {isFee && (
                      <Input
                        aria-label={`Amount ${index + 1}`}
                        value={item.amount}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === index ? { ...it, amount: e.target.value.replace(/[^\d.]/g, '') } : it
                            )
                          )
                        }
                        placeholder="0.00"
                        inputMode="decimal"
                        className="w-32 shrink-0 tabular-nums"
                      />
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove item ${index + 1}`}
                      disabled={items.length === 1}
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <X />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setItems((prev) => [...prev, { description: '', amount: '' }])}
                >
                  <Plus />
                  Add another
                </Button>

                {touched && itemsMissing && (
                  <p role="alert" className="text-caption text-danger">
                    List at least one thing the applicant has to supply.
                  </p>
                )}
                {touched && !itemsMissing && amountMissing && (
                  <p role="alert" className="text-caption text-danger">
                    A fee shortfall needs an amount — the applicant is being asked to pay something specific.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Remarks ──────────────────────────────────────────────────── */}
          <Field
            label="Remarks"
            htmlFor="action-remarks"
            required={action.requiresRemarks}
            error={touched && remarksMissing ? 'Say why, in a sentence. This goes on the record.' : undefined}
            hint={
              touched && remarksMissing
                ? undefined
                : 'Recorded against this decision and visible to the applicant.'
            }
          >
            <Textarea
              id="action-remarks"
              rows={4}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              invalid={touched && remarksMissing}
              maxLength={4000}
              placeholder={
                needsShortfall
                  ? 'Explain what is missing and what the applicant must do.'
                  : 'Your note on this decision.'
              }
            />
          </Field>

          {action.requiresAttachment && (
            <p className="rounded border border-border bg-surface-sunk px-3 py-2 text-caption text-text-muted">
              This action is configured to require an attachment. Upload the supporting file on the
              Documents tab first — the workflow references stored files rather than carrying them, so
              that nothing unscanned is ever attached to a decision.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={action.intent === 'destructive' ? 'destructive' : 'primary'}
            onClick={submit}
            loading={submitting}
            // Deliberately NOT disabled while something is missing: pressing it
            // shows which field is wanted. A dead button with no explanation is
            // the commonest way a form wastes somebody's afternoon.
            className={cn(blocked && touched && 'ring-2 ring-danger ring-offset-1')}
          >
            {action.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
