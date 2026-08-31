'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Ban, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/fees';
import { api, ApiCallError } from '@/features/applications/api';

/**
 * The demo gateway's screen.
 *
 * Every control here belongs to the GATEWAY, not to the application: choosing
 * "Decline" makes the demo gateway say it declined, and the settlement then
 * confirms that by asking. Nothing on this page writes a payment status.
 *
 * The two controls under the fold — a different amount, and a double delivery
 * — exist so that the two failure modes that are hardest to explain in a
 * meeting can be DEMONSTRATED rather than described:
 *
 *   · a gateway that reports an amount which does not match the demand, and a
 *     settlement that consequently credits nothing at all;
 *   · the same callback delivered twice, and a demand that is credited once.
 */
export function DemoGateway({
  paymentId,
  paymentRef,
  amount,
  settled,
  status,
  expiresAt,
  applicationNumber,
  demandNumber,
  payerName,
}: {
  paymentId: string;
  paymentRef: string;
  amount: number;
  settled: boolean;
  status: string;
  expiresAt: string | null;
  applicationNumber: string;
  demandNumber: string;
  payerName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [amountOverride, setAmountOverride] = React.useState('');
  const [deliverTwice, setDeliverTwice] = React.useState(false);

  async function choose(outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') {
    setBusy(outcome);
    try {
      const result = await api.post<{ returnUrl: string; delivered: number }>(
        `/api/payments/gateway/mock/${encodeURIComponent(paymentRef)}`,
        {
          outcome,
          amountOverride: amountOverride.trim() || undefined,
          deliverTwice,
        }
      );

      if (result.delivered > 1) {
        toast.info('The gateway delivered the same callback twice', {
          description: 'The second delivery is refused by the duplicate key and credits nothing.',
        });
      }

      // Back to the application, exactly as a real gateway's return URL would.
      router.push(result.returnUrl);
      router.refresh();
    } catch (error) {
      toast.error('The demo gateway could not complete', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-6">
      {/* Nothing about this looks like the rest of the product, on purpose. */}
      <div className="overflow-hidden rounded-lg border-2 border-dashed border-warning bg-warning-bg/40">
        <div className="flex items-start gap-2.5 border-b-2 border-dashed border-warning bg-warning-bg px-5 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="text-body font-semibold text-warning">Demonstration payment gateway</p>
            <p className="text-caption text-text-muted">
              This is not a real payment page and no money changes hands. It stands in for the
              gateway an operator would be redirected to.
            </p>
          </div>
        </div>

        <div className="space-y-4 bg-surface px-5 py-5">
          <div>
            <p className="text-caption uppercase tracking-wide text-text-muted">Amount payable</p>
            <p className="text-display font-semibold tabular-nums text-text">{formatMoney(amount)}</p>
          </div>

          <dl className="grid gap-x-6 gap-y-1.5 text-small sm:grid-cols-2">
            <Field label="Merchant reference" value={paymentRef} />
            <Field label="Application" value={applicationNumber} />
            <Field label="Fee demand" value={demandNumber} />
            {payerName && <Field label="Payer" value={payerName} />}
          </dl>

          {settled ? (
            <div className="rounded border border-border bg-surface-sunk px-4 py-3 text-small">
              <p className="font-medium text-text">This payment has already been settled.</p>
              <p className="mt-0.5 text-text-muted">
                It is currently <strong>{status}</strong>. A settled payment cannot be settled again
                — that is what stops a repeated callback from crediting twice.
              </p>
              <Button
                className="mt-3"
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/payments/${paymentId}/return`)}
              >
                Back to the application
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  variant="primary"
                  onClick={() => choose('SUCCESS')}
                  loading={busy === 'SUCCESS'}
                  disabled={busy !== null}
                >
                  <CheckCircle2 className="size-4" />
                  Pay
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => choose('FAILED')}
                  loading={busy === 'FAILED'}
                  disabled={busy !== null}
                >
                  <XCircle className="size-4" />
                  Decline
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => choose('CANCELLED')}
                  loading={busy === 'CANCELLED'}
                  disabled={busy !== null}
                >
                  <Ban className="size-4" />
                  Cancel
                </Button>
              </div>

              {expiresAt && (
                <p className="flex items-center gap-1.5 text-caption text-text-muted">
                  <Clock className="size-3.5" aria-hidden />
                  This payment window closes {new Date(expiresAt).toLocaleString('en-IN')}. After
                  that the attempt times out and a new one can be started.
                </p>
              )}

              <details className="rounded border border-border bg-surface-sunk px-4 py-3">
                <summary className="cursor-pointer text-small font-medium text-text">
                  Make the gateway misbehave
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="amountOverride">Report a different amount</Label>
                    <Input
                      id="amountOverride"
                      inputMode="decimal"
                      placeholder={amount.toFixed(2)}
                      value={amountOverride}
                      onChange={(e) => setAmountOverride(e.target.value)}
                    />
                    <p className="text-caption text-text-muted">
                      The settlement compares the gateway’s figure with the demand to the paisa.
                      They disagree, and it credits neither — nothing is part-paid, and the finance
                      office is notified.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <Switch
                      id="deliverTwice"
                      checked={deliverTwice}
                      onCheckedChange={setDeliverTwice}
                    />
                    <div>
                      <Label htmlFor="deliverTwice">Deliver the callback twice</Label>
                      <p className="text-caption text-text-muted">
                        What a gateway does when it does not see our acknowledgement. The demand is
                        credited once.
                      </p>
                    </div>
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="truncate font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}
