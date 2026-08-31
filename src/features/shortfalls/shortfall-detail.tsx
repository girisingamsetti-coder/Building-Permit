'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CircleCheck,
  Clock,
  FileUp,
  MessageSquare,
  Paperclip,
  Send,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { StatusBadge } from '@/components/common/status-badge';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { api, ApiCallError } from '@/features/applications/api';
import { stageName } from '@/lib/workflow';
import { formatMoney } from '@/lib/fees';
import { KIND_META, dueLabel, isOverdue, isShortfallOpen, kindLabel, turnOf } from '@/lib/shortfalls';
import { cn } from '@/lib/utils';
import type { ShortfallActionResult, ShortfallDetail as Detail, UploadedAttachment } from './types';

/**
 * One shortfall, end to end: what was asked, what is owed, what has been said
 * about it, and the one thing the reader can do next.
 *
 * ── The screen is built around whose move it is ──────────────────────────
 *
 * An applicant sees the required action, the items, the demand if there is
 * one, and a response box. An officer sees the same history and an accept /
 * reject pair. Neither sees the other's controls, because a form you cannot
 * submit is worse than no form.
 *
 * ── A fee shortfall shows the money and its state ────────────────────────
 *
 * The demand, what is outstanding, and a link to pay it. The officer's Accept
 * is refused by the server until the ledger says it is paid, so the screen
 * says so first rather than letting somebody discover it in an error toast.
 */
export function ShortfallDetailView({
  initial,
  viewerIsApplicant,
  canRespond,
  canReview,
  canWithdraw,
}: {
  initial: Detail;
  viewerIsApplicant: boolean;
  canRespond: boolean;
  canReview: boolean;
  canWithdraw: boolean;
}) {
  const router = useRouter();
  const [shortfall, setShortfall] = React.useState(initial);
  const [response, setResponse] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  const [attachments, setAttachments] = React.useState<UploadedAttachment[]>([]);
  const [busy, setBusy] = React.useState<'respond' | 'accept' | 'reject' | 'upload' | null>(null);
  const [withdrawing, setWithdrawing] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setShortfall(initial), [initial]);

  const open = isShortfallOpen(shortfall.status);
  const turn = turnOf(shortfall.status);
  const overdue = isOverdue(shortfall.dueDate, shortfall.status);

  const unpaid = shortfall.demands.filter((d) =>
    ['DRAFT', 'ISSUED', 'PARTIALLY_PAID'].includes(d.status)
  );

  const applicantTurn = open && turn === 'APPLICANT';
  const officerTurn = open && turn === 'OFFICER';

  async function refresh() {
    try {
      setShortfall(await api.get<Detail>(`/api/shortfalls/${shortfall.id}`));
    } catch {
      // Keep what is on screen; the router refresh re-renders from the server.
    }
    router.refresh();
  }

  async function upload(file: File) {
    setBusy('upload');
    try {
      const form = new FormData();
      form.append('file', file);

      const result = await fetch(`/api/shortfalls/${shortfall.id}/attachments`, {
        method: 'POST',
        body: form,
      });

      const body = (await result.json()) as UploadedAttachment & { error?: string };
      if (!result.ok) throw new ApiCallError(body.error ?? 'That file could not be attached.');

      setAttachments((current) => [...current, body]);
      toast.success('Attached', { description: body.name });
    } catch (error) {
      toast.error(error instanceof ApiCallError ? error.message : 'That file could not be attached.');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function respond() {
    if (!response.trim()) {
      toast.error('Say what you have done about it.');
      return;
    }

    setBusy('respond');
    try {
      const result = await api.post<ShortfallActionResult>(
        `/api/shortfalls/${shortfall.id}/respond`,
        {
          response: response.trim(),
          attachments: attachments.map((a) => ({ fileObjectId: a.fileObjectId, name: a.name, note: '' })),
        }
      );

      toast.success(result.message, { description: shortfall.shortfallNumber });
      setResponse('');
      setAttachments([]);
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiCallError ? error.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  async function review(accept: boolean) {
    if (!remarks.trim()) {
      toast.error('Say why, in a sentence. Your decision goes on the record either way.');
      return;
    }

    setBusy(accept ? 'accept' : 'reject');
    try {
      const result = await api.post<ShortfallActionResult>(
        `/api/shortfalls/${shortfall.id}/review`,
        { accept, remarks: remarks.trim() }
      );

      toast.success(result.message, {
        description: result.movedTo ? `The file is now at ${stageName(result.movedTo)}.` : undefined,
      });
      setRemarks('');
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiCallError ? error.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(reason: string) {
    try {
      const result = await api.post<ShortfallActionResult>(
        `/api/shortfalls/${shortfall.id}/withdraw`,
        { reason }
      );
      toast.success(result.message);
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiCallError ? error.message : 'That did not work.');
    }
  }

  return (
    <div className="space-y-5">
      {/* ── What was asked ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {shortfall.title}
              <StatusBadge kind="shortfall" status={shortfall.status} />
              <Badge tone="outline">{kindLabel(shortfall.kind)}</Badge>
              {shortfall.mode === 'REPORTED' && <Badge tone="info">Travels with the file</Badge>}
            </CardTitle>
            <CardDescription>
              {shortfall.shortfallNumber} · raised at {stageName(shortfall.raisedAtStageCode)} by{' '}
              {shortfall.raisedByName || shortfall.raisedByRoleKey.replace(/_/g, ' ')} on{' '}
              {new Date(shortfall.raisedAt).toLocaleDateString()}
            </CardDescription>
          </div>

          {shortfall.dueDate && open && (
            <div className="shrink-0 text-right">
              <p
                className={cn(
                  'flex items-center gap-1 text-small tabular-nums',
                  overdue ? 'font-medium text-danger' : 'text-text'
                )}
              >
                <Clock className="size-4" aria-hidden />
                {dueLabel(shortfall.dueDate)}
              </p>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="text-caption text-text-muted">What is wrong</p>
            <p className="text-body text-text">{shortfall.description}</p>
          </div>

          {shortfall.requiredAction && (
            <div className="rounded border border-border bg-surface-sunk p-3">
              <p className="text-caption text-text-muted">What is required</p>
              <p className="text-body font-medium text-text">{shortfall.requiredAction}</p>
            </div>
          )}

          {shortfall.items.length > 0 && (
            <div>
              <p className="mb-1.5 text-caption text-text-muted">
                {shortfall.kind === 'FEE' ? 'Amounts' : 'Items'}
              </p>
              <ul className="divide-y divide-border rounded border border-border">
                {shortfall.items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="flex min-w-0 items-baseline gap-2">
                      {item.isResolved ? (
                        <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                      ) : (
                        <span className="size-4 shrink-0" aria-hidden />
                      )}
                      <span className={cn('text-small', item.isResolved && 'text-text-muted line-through')}>
                        {item.description}
                      </span>
                      {item.documentTypeName && (
                        <Badge tone="outline">{item.documentTypeName}</Badge>
                      )}
                    </span>
                    {item.amount && (
                      <span className="shrink-0 tabular-nums text-text">
                        {formatMoney(Number(item.amount))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-caption text-text-muted">
            On application{' '}
            <Link
              href={`/applications/${shortfall.application.id}`}
              className="text-primary hover:underline"
            >
              {shortfall.application.applicationNumber}
            </Link>
            {shortfall.application.currentStageCode
              ? ` · now at ${stageName(shortfall.application.currentStageCode)}`
              : ''}
          </p>
        </CardContent>
      </Card>

      {/* ── The money ─────────────────────────────────────────────────────── */}
      {shortfall.demands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Additional demand</CardTitle>
            <CardDescription>
              {unpaid.length
                ? 'This shortfall cannot be settled until the demand has been paid — the officer’s Accept reads the ledger, not the response.'
                : 'Paid in full.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {shortfall.demands.map((demand) => (
              <div
                key={demand.id}
                className="flex flex-wrap items-baseline justify-between gap-3 rounded border border-border px-3 py-2"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-medium text-text">{demand.demandNumber}</span>
                  <StatusBadge kind="demand" status={demand.status} />
                </span>
                <span className="flex items-baseline gap-4">
                  <span className="tabular-nums text-text">{formatMoney(Number(demand.totalAmount))}</span>
                  {viewerIsApplicant && ['ISSUED', 'PARTIALLY_PAID'].includes(demand.status) && (
                    <Button size="sm" asChild>
                      <Link href={`/applications/${shortfall.application.id}?tab=payments`}>
                        Pay
                        <ArrowRight />
                      </Link>
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Respond ───────────────────────────────────────────────────────── */}
      {applicantTurn && canRespond && (
        <Card>
          <CardHeader>
            <CardTitle>Your response</CardTitle>
            <CardDescription>
              {KIND_META[shortfall.kind]?.asks ?? 'Respond below.'}{' '}
              {shortfall.kind === 'DOCUMENT' &&
                'A document the department will verify should go on the Documents tab of the application; anything else can be attached here.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <Field label="What have you done?" htmlFor="shortfall-response" required>
              <Textarea
                id="shortfall-response"
                rows={4}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                maxLength={4000}
                placeholder="A certificate dated this month has been uploaded on the Documents tab."
              />
            </Field>

            <div className="space-y-2">
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />

              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={busy === 'upload'}
                onClick={() => fileInput.current?.click()}
              >
                <FileUp />
                Attach a file
              </Button>

              {attachments.length > 0 && (
                <ul className="space-y-1">
                  {attachments.map((attachment) => (
                    <li
                      key={attachment.fileObjectId}
                      className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-small"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Paperclip className="size-3.5 shrink-0 text-text-muted" aria-hidden />
                        <span className="truncate">{attachment.name}</span>
                        <span className="shrink-0 text-caption text-text-muted">
                          {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${attachment.name}`}
                        onClick={() =>
                          setAttachments((current) =>
                            current.filter((a) => a.fileObjectId !== attachment.fileObjectId)
                          )
                        }
                        className="shrink-0 text-text-subtle hover:text-text"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button onClick={respond} loading={busy === 'respond'} variant="primary">
              <Send />
              Submit response
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Decide ────────────────────────────────────────────────────────── */}
      {officerTurn && canReview && (
        <Card>
          <CardHeader>
            <CardTitle>Your decision</CardTitle>
            <CardDescription>
              Accepting settles the shortfall{shortfall.mode === 'BLOCKING' ? ' and resumes the review' : ''}.
              Rejecting sends it back to the applicant for another attempt — both attempts stay on the
              record.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {unpaid.length > 0 && (
              <p className="flex items-start gap-2 rounded border border-warning/40 bg-warning-bg px-3 py-2 text-small text-text">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                {unpaid.map((d) => d.demandNumber).join(', ')} {unpaid.length === 1 ? 'is' : 'are'}{' '}
                still unpaid. This shortfall cannot be accepted until the payment shows against the
                demand.
              </p>
            )}

            <Field label="Remarks" htmlFor="review-remarks" required>
              <Textarea
                id="review-remarks"
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={4000}
                placeholder="The certificate is current and matches the survey number. Accepted."
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                loading={busy === 'accept'}
                disabled={unpaid.length > 0}
                onClick={() => review(true)}
              >
                <CircleCheck />
                Accept
              </Button>
              <Button variant="destructive" loading={busy === 'reject'} onClick={() => review(false)}>
                <X />
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── History ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Responses</CardTitle>
            <CardDescription>
              Every attempt, in order. A rejected response is kept beside the one that replaced it.
            </CardDescription>
          </div>

          {canWithdraw && open && (
            <Button variant="ghost" size="sm" onClick={() => setWithdrawing(true)}>
              <Ban />
              Withdraw
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {shortfall.resolutions.length === 0 ? (
            <p className="text-small text-text-muted">
              {applicantTurn
                ? 'You have not responded yet.'
                : 'The applicant has not responded yet.'}
            </p>
          ) : (
            <ol className="space-y-3">
              {shortfall.resolutions.map((resolution) => (
                <li key={resolution.id} className="rounded border border-border p-3">
                  <p className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
                    <MessageSquare className="size-3.5" aria-hidden />
                    Attempt {resolution.attemptNo} · {resolution.respondedByName} ·{' '}
                    {new Date(resolution.respondedAt).toLocaleString()}
                    {resolution.reviewedAt ? (
                      resolution.accepted ? (
                        <Badge tone="success">Accepted</Badge>
                      ) : (
                        <Badge tone="danger">Not accepted</Badge>
                      )
                    ) : (
                      <Badge tone="info">Awaiting a decision</Badge>
                    )}
                  </p>

                  <p className="mt-1 text-small text-text">{resolution.response}</p>

                  {Array.isArray(resolution.attachments) && resolution.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {resolution.attachments.map((attachment, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-caption text-text-muted"
                        >
                          <Paperclip className="size-3.5" aria-hidden />
                          {attachment.name ?? 'Attachment'}
                        </li>
                      ))}
                    </ul>
                  )}

                  {resolution.reviewedAt && resolution.reviewRemarks && (
                    <p className="mt-2 border-t border-border pt-2 text-caption text-text-muted">
                      {resolution.reviewedByName}: {resolution.reviewRemarks}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {shortfall.closedAt && (
            <p className="mt-3 border-t border-border pt-3 text-caption text-text-muted">
              Closed {new Date(shortfall.closedAt).toLocaleString()}
              {shortfall.closedByName ? ` by ${shortfall.closedByName}` : ''}
              {shortfall.closureRemarks ? ` — ${shortfall.closureRemarks}` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={withdrawing}
        onOpenChange={setWithdrawing}
        title={`Withdraw ${shortfall.shortfallNumber}?`}
        description="Use this when the shortfall should not have been raised. It is not the same as settling it — the record will say it was withdrawn, and nothing will be treated as supplied."
        confirmLabel="Withdraw"
        destructive
        requireReason
        reasonLabel="Why is it being withdrawn?"
        onConfirm={withdraw}
      />
    </div>
  );
}
