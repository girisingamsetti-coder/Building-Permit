import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/server/config/env';
import { prisma } from '@/server/db/prisma';
import { settingString, settingNumber } from '@/server/services/settings';
import { badRequest, serviceUnavailable } from '@/server/http/errors';
import type { ProviderState } from '@/lib/payments';
import { isProviderState } from '@/lib/payments';
import type {
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  ProviderStatus,
  WebhookEvent,
} from './types';

/**
 * The mock payment gateway — docs/07-subsystems.md O.1.
 *
 * ── What this is for, and what it is not ───────────────────────────────
 *
 * It exists to make the demand → pay → verify → receipt → PENDING_TPA
 * lifecycle testable end to end, including every way it can go wrong. It moves
 * NO MONEY, and it is built so that nobody can mistake it for something that
 * does:
 *
 *   · `isDemo` is true, so every receipt it produces is stamped "DEMO PAYMENT
 *     — NO MONEY HAS CHANGED HANDS" and the UI says the same.
 *   · `payments.provider` records "mock" against every attempt, for ever — a
 *     finance officer opening a two-year-old file can tell.
 *   · It REFUSES to run in production unless someone has explicitly set
 *     ALLOW_MOCK_PAYMENTS_IN_PRODUCTION. Shipping without a real gateway is
 *     then a deliberate act with a trail, not an oversight.
 *
 * ── Where the gateway's own state lives ────────────────────────────────
 *
 * A real gateway keeps a ledger we cannot see and answers `verify()` from it.
 * This one keeps its ledger in `payment_webhook_events` — the rows it emitted
 * when the demo gateway page was used — and answers `verify()` by reading the
 * last one it wrote for that reference.
 *
 * That is deliberately the gateway's side of the boundary, not ours. The
 * settlement path in services/payments.ts never reads a callback body; it
 * calls `verify()` like it would for any other driver, and this driver happens
 * to implement `verify()` by consulting the store it controls. Swap in
 * Razorpay and the same settlement code calls a real API instead. Nothing
 * about §5.1 relaxes for the mock — a forged callback with a bad signature is
 * rejected here exactly as it would be by a real driver.
 *
 * ── Determinism ────────────────────────────────────────────────────────
 *
 * With no gateway decision recorded, the outcome comes from `mock_payment_mode`
 * in system settings. MANUAL — the default — answers PENDING and waits for a
 * human to press a button on the demo gateway page. The AUTO_* modes answer
 * immediately, which is what the integration suite uses: no browser, no sleep,
 * and the same code path either way.
 */

type MockMode = 'MANUAL' | 'AUTO_SUCCESS' | 'AUTO_FAILURE' | 'AUTO_CANCEL' | 'AUTO_PENDING';

/** The mock's callback signature header. A real driver uses the provider's. */
export const MOCK_SIGNATURE_HEADER = 'x-lams-mock-signature';

/**
 * The secret the demo gateway signs with.
 *
 * Falls back to a fixed development string so a fresh checkout works without
 * configuration — and it is a fallback for the MOCK only. Every real driver
 * refuses outright when `PAYMENT_WEBHOOK_SECRET` is unset, because an
 * unverifiable callback from a real gateway is not something to paper over.
 */
const mockSecret = (): string => env.paymentWebhookSecret || 'lams-mock-gateway-secret';

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isDemo = true;

  /**
   * A mock payment is not a payment, so in production this driver is unusable
   * unless someone has said otherwise in writing (an env var).
   */
  get configured(): boolean {
    return !env.isProduction || env.allowMockPaymentsInProduction;
  }

  private assertUsable(): void {
    if (this.configured) return;
    throw serviceUnavailable(
      'Online payment is not available: this deployment has no real payment gateway ' +
        'configured, and a mock payment does not move money.'
    );
  }

  /**
   * "Creates an order" and hands back somewhere to send the payer.
   *
   * The demo gateway is a page of this application, at `/payments/gateway/…`.
   * It is styled as an obviously separate, obviously fake gateway precisely so
   * that a demo audience never mistakes it for the product's own screen.
   */
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    this.assertUsable();

    const delayMs = await settingNumber('mock_payment_delay_ms', 0);
    if (delayMs > 0) await sleep(delayMs);

    return {
      providerOrderId: `mock_order_${input.paymentRef}`,
      redirectUrl: `${env.appUrl}/payments/gateway/${encodeURIComponent(input.paymentRef)}`,
      payload: {
        driver: 'mock',
        disclaimer: 'MockPaymentProvider. No money changes hands.',
        amount: input.amount,
        demandNumber: input.demandNumber,
        applicationNumber: input.applicationNumber,
      },
    };
  }

  /**
   * The authoritative question.
   *
   * Reads the gateway's own store — the callbacks it has emitted for this
   * reference — and falls back to the configured mode when there is nothing
   * there. A payment nobody has acted on answers PENDING, which is the honest
   * answer and the one that leaves the money uncredited.
   */
  async verify(paymentRef: string): Promise<ProviderStatus> {
    this.assertUsable();

    const decision = await this.gatewayDecision(paymentRef);
    if (decision) return decision;

    const mode = (await settingString('mock_payment_mode', 'MANUAL')) as MockMode;
    const attempt = await prisma.payment.findUnique({
      where: { paymentRef },
      select: { amount: true },
    });

    // The gateway was told the amount at initiate, so it reports that amount
    // back. The delta setting exists to exercise the mismatch path (§9) with a
    // gateway that claims a different figure — the one case where a settlement
    // must refuse rather than credit.
    const delta = await settingNumber('mock_payment_amount_delta', 0);
    const amount = attempt ? attempt.amount.plus(delta).toFixed(2) : null;

    const state = MODE_STATES[mode] ?? 'PENDING';

    return {
      state,
      gatewayTxnId: state === 'PENDING' ? undefined : `mock_txn_${paymentRef}`,
      bankRef: state === 'SUCCESS' ? `MOCKBANK${paymentRef.slice(-8)}` : '',
      method: state === 'SUCCESS' ? 'DEMO' : '',
      amount: state === 'SUCCESS' ? amount : null,
      message: MODE_MESSAGES[state],
      raw: { driver: 'mock', mode, verifiedAt: new Date().toISOString() },
    };
  }

  /**
   * Reads the last callback this gateway emitted for the reference.
   *
   * Signature-verified events only. An unsigned row could only have been
   * written by something bypassing `parseWebhook`, and treating it as the
   * gateway's word would defeat the check it skipped.
   */
  private async gatewayDecision(paymentRef: string): Promise<ProviderStatus | null> {
    const event = await prisma.paymentWebhookEvent.findFirst({
      where: { provider: this.name, paymentRef, signatureOk: true },
      orderBy: { receivedAt: 'desc' },
      select: { payload: true, eventType: true },
    });

    if (!event) return null;

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const raw = String(payload.state ?? '').toUpperCase();
    // Anything the gateway said that we do not recognise is "not finished".
    const state: ProviderState = isProviderState(raw) ? raw : 'PENDING';

    return {
      state,
      gatewayTxnId: typeof payload.gatewayTxnId === 'string' ? payload.gatewayTxnId : undefined,
      bankRef: typeof payload.bankRef === 'string' ? payload.bankRef : '',
      method: typeof payload.method === 'string' ? payload.method : 'DEMO',
      amount: typeof payload.amount === 'string' ? payload.amount : null,
      message: typeof payload.message === 'string' ? payload.message : MODE_MESSAGES[state],
      raw: { driver: 'mock', source: 'gateway-callback', eventType: event.eventType, payload },
    };
  }

  /**
   * Verifies a callback from the demo gateway.
   *
   * The signature check is real, and it is not a formality: it is the same
   * check a live driver performs, exercised on every demo run, so the day a
   * real gateway is wired in the surrounding code has already been proved
   * against a signed callback rather than a trusting one.
   */
  async parseWebhook(req: Request): Promise<WebhookEvent> {
    const raw = await req.text();
    const provided = req.headers.get(MOCK_SIGNATURE_HEADER) ?? '';

    if (!safeEqual(provided, sign(raw))) {
      throw badRequest('That payment callback signature is not valid.');
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw badRequest('That payment callback could not be read as JSON.');
    }

    const paymentRef = String(body.paymentRef ?? '');
    const eventId = String(body.eventId ?? '');
    const stateRaw = String(body.state ?? '').toUpperCase();

    if (!paymentRef || !eventId) {
      throw badRequest('That payment callback names no payment.');
    }

    return {
      externalId: eventId,
      eventType: String(body.eventType ?? `payment.${stateRaw.toLowerCase()}`),
      paymentRef,
      hint: isProviderState(stateRaw) ? stateRaw : 'PENDING',
      payload: body,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// The demo gateway's side
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Builds a genuine, signed callback exactly as the demo gateway would send it.
 *
 * The demo gateway route hands the result to the ordinary webhook handler
 * rather than shortcutting into the service. That is the point: pressing "Pay"
 * on the demo page runs the same signature check, the same duplicate-event
 * key, the same settlement transaction and the same verify() call that a real
 * gateway's callback would. There is no demo-only settlement path to keep in
 * step with the real one, because there is only one path.
 */
export function buildMockGatewayCallback(input: {
  paymentRef: string;
  state: ProviderState;
  amount: string;
  /** Same eventId twice = the duplicate-delivery case, on purpose. */
  eventId?: string;
  method?: string;
  message?: string;
}): { body: string; signature: string; headers: Record<string, string> } {
  const state = input.state;

  const payload = {
    eventId: input.eventId ?? `mock_evt_${input.paymentRef}_${state}`,
    eventType: `payment.${state.toLowerCase()}`,
    paymentRef: input.paymentRef,
    state,
    amount: input.amount,
    gatewayTxnId: state === 'PENDING' ? '' : `mock_txn_${input.paymentRef}`,
    bankRef: state === 'SUCCESS' ? `MOCKBANK${input.paymentRef.slice(-8)}` : '',
    method: input.method ?? (state === 'SUCCESS' ? 'DEMO' : ''),
    message: input.message ?? MODE_MESSAGES[state],
    occurredAt: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const signature = sign(body);

  return {
    body,
    signature,
    headers: { 'content-type': 'application/json', [MOCK_SIGNATURE_HEADER]: signature },
  };
}

/** A `Request` the webhook handler can be fed directly. */
export function buildMockGatewayRequest(input: Parameters<typeof buildMockGatewayCallback>[0]): Request {
  const { body, headers } = buildMockGatewayCallback(input);
  return new Request(`${env.appUrl}/api/payments/webhook/mock`, {
    method: 'POST',
    headers,
    body,
  });
}

const sign = (raw: string): string => createHmac('sha256', mockSecret()).update(raw).digest('hex');

const MODE_STATES: Record<MockMode, ProviderState> = {
  MANUAL: 'PENDING',
  AUTO_SUCCESS: 'SUCCESS',
  AUTO_FAILURE: 'FAILED',
  AUTO_CANCEL: 'CANCELLED',
  AUTO_PENDING: 'PENDING',
};

const MODE_MESSAGES: Record<ProviderState, string> = {
  PENDING: 'The demo gateway is waiting for the payer.',
  SUCCESS: 'Demo payment completed. No money changed hands.',
  FAILED: 'The demo gateway declined this payment.',
  CANCELLED: 'The payer cancelled at the demo gateway.',
};

/** Constant-time compare that does not leak length through an exception. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
