'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Ban, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  async function choose(outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') {
    setBusy(outcome);
    try {
      const result = await api.post<{ returnUrl: string; delivered: number }>(
        `/api/payments/gateway/mock/${encodeURIComponent(paymentRef)}`,
        { outcome }
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
      toast.error('Payment transaction could not complete', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-6">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-elevated">
        <div className="flex items-center gap-3 border-b border-border/70 bg-gradient-to-r from-blue-600 to-indigo-700 px-5 py-4 text-white">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur-sm">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <p className="text-body font-bold text-white">AP Cyber Treasury Gateway</p>
            <p className="text-caption text-white/80">
              Government of Andhra Pradesh · Secure Payment Processing
            </p>
          </div>
        </div>

        <div className="space-y-5 bg-surface p-6">
          <div className="rounded-xl border border-border/60 bg-surface-sunk p-4">
            <p className="text-caption uppercase tracking-wider font-semibold text-text-muted">Total Amount Payable</p>
            <p className="mt-1 text-display font-bold tabular-nums text-primary">{formatMoney(amount)}</p>
          </div>

          <dl className="grid gap-x-6 gap-y-2.5 text-small sm:grid-cols-2">
            <Field label="Transaction Reference" value={paymentRef} />
            <Field label="Application Number" value={applicationNumber} />
            <Field label="Demand Notice" value={demandNumber} />
            {payerName && <Field label="Payer Name" value={payerName} />}
          </dl>

          {settled ? (
            <div className="rounded-xl border border-border bg-surface-sunk px-4 py-3.5 text-small">
              <p className="font-semibold text-text">This payment has already been settled.</p>
              <p className="mt-0.5 text-text-muted">
                Status: <strong className="text-success">{status}</strong>.
              </p>
              <Button
                className="mt-3"
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/payments/${paymentId}/return`)}
              >
                Back to application
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <Button
                  variant="primary"
                  onClick={() => choose('SUCCESS')}
                  loading={busy === 'SUCCESS'}
                  disabled={busy !== null}
                >
                  <CheckCircle2 className="size-4" />
                  Pay Now
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
                  Session expires: {new Date(expiresAt).toLocaleTimeString('en-IN')}.
                </p>
              )}

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
