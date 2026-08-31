'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/status-badge';
import { toast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/fees';
import { isOpenPayment, methodLabel, PAYMENT_STATUS_DESCRIPTIONS } from '@/lib/payments';
import { api, ApiCallError } from '@/features/applications/api';
import type { PaymentRow, SettlementResponse } from './types';

/**
 * The screen a payer lands on when the gateway sends them back.
 *
 * ── It asks the server, and keeps asking ───────────────────────────────
 *
 * On mount it calls `/verify`, which is a server-to-server question to the
 * gateway. If the answer is "not finished", it asks again — a handful of times,
 * slowing down — because a net-banking payment routinely takes longer than a
 * redirect does, and a payer told "failed" while their money is still moving
 * will pay twice.
 *
 * It gives up POLLING, never on the payment. The closing message says the
 * reconciliation sweep will finish the job and that no second payment is
 * needed, because that is true: nothing in this system depends on a browser
 * coming back.
 *
 * ── Nothing on this screen decides anything ────────────────────────────
 *
 * Every status rendered here arrived from the server. A payer who edits the
 * response sees a different word and owes exactly the same money.
 */
export function PaymentReturn({
  initial,
  applicationId,
  applicationNumber,
  demandNumber,
}: {
  initial: PaymentRow;
  applicationId: string;
  applicationNumber: string;
  demandNumber: string;
}) {
  const router = useRouter();
  const [payment, setPayment] = React.useState(initial);
  const [checking, setChecking] = React.useState(isOpenPayment(initial.status));
  const [gaveUp, setGaveUp] = React.useState(false);
  const [message, setMessage] = React.useState('');

  // A ref, not state: the effect must not re-run because a counter changed.
  const attempts = React.useRef(0);

  const verify = React.useCallback(async (): Promise<string> => {
    const outcome = await api.post<SettlementResponse>(`/api/payments/${initial.id}/verify`);
    const fresh = await api.get<PaymentRow>(`/api/payments/${initial.id}`);
    setPayment(fresh);
    setMessage(outcome.message);
    return outcome.status;
  }, [initial.id]);

  React.useEffect(() => {
    if (!isOpenPayment(initial.status)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // 2s, 3s, 5s, 8s, 13s — about half a minute of asking, weighted towards
    // answering a fast gateway quickly rather than hammering a slow one.
    const backoff = [2000, 3000, 5000, 8000, 13_000];

    async function ask() {
      try {
        const status = await verify();
        if (cancelled) return;

        if (!isOpenPayment(status)) {
          setChecking(false);
          router.refresh();
          return;
        }
      } catch (error) {
        if (cancelled) return;
        // A verification that could not reach the gateway is not a verdict.
        // Keep asking; say nothing alarming to the payer.
        if (error instanceof ApiCallError && error.status >= 500) {
          // fall through to the retry below
        }
      }

      const wait = backoff[attempts.current];
      attempts.current += 1;

      if (wait === undefined) {
        setChecking(false);
        setGaveUp(true);
        return;
      }

      timer = setTimeout(ask, wait);
    }

    void ask();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initial.status, router, verify]);

  async function checkNow() {
    setChecking(true);
    try {
      const status = await verify();
      if (!isOpenPayment(status)) router.refresh();
      else toast.info('Still with the gateway', { description: 'The payment has not completed yet.' });
    } catch (error) {
      toast.error('The gateway could not be reached', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
    } finally {
      setChecking(false);
    }
  }

  const view = viewFor(payment.status, checking);

  return (
    <div className="mx-auto max-w-xl py-8">
      <Card>
        <CardContent className="space-y-5 px-6 py-8 text-center">
          <div className="flex justify-center">
            <div className={`rounded-full p-3 ${view.iconBg}`}>
              <view.icon className={`size-7 ${view.iconColor} ${view.spin ? 'animate-spin' : ''}`} />
            </div>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-h2 font-semibold text-text">{view.title}</h1>
            <p className="mx-auto max-w-[46ch] text-small text-text-muted">
              {message || payment.failureReason || PAYMENT_STATUS_DESCRIPTIONS[payment.status] || view.body}
            </p>
          </div>

          <dl className="mx-auto grid max-w-sm gap-x-6 gap-y-2 text-left text-small">
            <Row label="Amount" value={formatMoney(payment.amount)} />
            <Row label="Application" value={applicationNumber} />
            <Row label="Fee demand" value={demandNumber} />
            <Row label="Reference" value={payment.paymentRef} />
            {payment.gatewayTxnId && <Row label="Transaction ID" value={payment.gatewayTxnId} />}
            {payment.method && <Row label="Method" value={methodLabel(payment.method)} />}
            {payment.receipt && <Row label="Receipt" value={payment.receipt.receiptNumber} />}
          </dl>

          <div className="flex justify-center">
            <StatusBadge kind="payment" status={payment.status} />
          </div>

          {gaveUp && (
            <p className="mx-auto max-w-[52ch] rounded border border-border bg-surface-sunk px-4 py-3 text-left text-small text-text-muted">
              The gateway has not answered yet. <strong className="text-text">Do not pay again.</strong>{' '}
              This system checks unsettled payments against the gateway automatically, and will
              credit yours the moment it confirms. You can leave this page — the application will
              update on its own.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {payment.status === 'SUCCESS' && (
              <Button asChild variant="secondary">
                <a href={`/api/payments/${payment.id}/receipt`}>
                  <Download className="size-4" />
                  Download receipt
                </a>
              </Button>
            )}

            {isOpenPayment(payment.status) && !checking && (
              <Button variant="secondary" onClick={checkNow}>
                <RotateCcw className="size-4" />
                Check again
              </Button>
            )}

            {payment.canRetry && (
              <Button asChild variant="primary">
                <Link href={`/applications/${applicationId}?tab=payments`}>
                  <RotateCcw className="size-4" />
                  Try the payment again
                </Link>
              </Button>
            )}

            <Button asChild variant={payment.status === 'SUCCESS' ? 'primary' : 'ghost'}>
              <Link href={`/applications/${applicationId}?tab=payments`}>
                Back to the application
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-1.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="truncate font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}

type View = {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  spin?: boolean;
  title: string;
  body: string;
};

/**
 * One state, one screen.
 *
 * The wording matters more than the colour. Every unsuccessful outcome says
 * explicitly whether anything was charged, because the question a payer has at
 * that moment is not "what is the status" — it is "has my money gone".
 */
function viewFor(status: string, checking: boolean): View {
  if (checking || status === 'PROCESSING' || status === 'PENDING' || status === 'INITIATED') {
    return {
      icon: Loader2,
      iconBg: 'bg-info-bg',
      iconColor: 'text-info',
      spin: true,
      title: 'Confirming your payment',
      body: 'We are checking with the payment gateway. This takes a few seconds — please do not close this window or pay again.',
    };
  }

  if (status === 'SUCCESS') {
    return {
      icon: CheckCircle2,
      iconBg: 'bg-success-bg',
      iconColor: 'text-success',
      title: 'Payment received',
      body: 'Your fee has been paid and your application has gone to the department for review.',
    };
  }

  if (status === 'CANCELLED') {
    return {
      icon: XCircle,
      iconBg: 'bg-neutral-bg',
      iconColor: 'text-neutral',
      title: 'Payment cancelled',
      body: 'Nothing has been charged. You can start the payment again whenever you are ready.',
    };
  }

  if (status === 'TIMEOUT') {
    return {
      icon: AlertTriangle,
      iconBg: 'bg-warning-bg',
      iconColor: 'text-warning',
      title: 'The payment timed out',
      body: 'The gateway did not complete it in time. If any money left your account it will be reversed by your bank.',
    };
  }

  return {
    icon: XCircle,
    iconBg: 'bg-danger-bg',
    iconColor: 'text-danger',
    title: 'Payment failed',
    body: 'The gateway did not complete this payment. Nothing has been charged — you can try again.',
  };
}
