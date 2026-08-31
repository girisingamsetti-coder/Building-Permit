import 'server-only';
import type { ProviderState } from '@/lib/payments';

/**
 * The payment integration boundary — docs/07-subsystems.md O.1.
 *
 * This interface is the ONLY thing business code may depend on. No service,
 * guard, route or component learns which gateway is live; they ask for a
 * payment to be started and apply whatever verdict comes back, from wherever
 * it comes.
 *
 * ── Why the interface is shaped like this ──────────────────────────────
 *
 * Indian payment gateways differ in almost every particular — Razorpay hands
 * back an order id and expects a browser SDK, PayU wants a form POST with a
 * hashed field list, CCAvenue encrypts the whole request with AES — but they
 * agree on the only three things this system needs:
 *
 *   initiate()      give me somewhere to send the payer
 *   verify()        server to server: what is the state of this payment?
 *   parseWebhook()  a callback arrived; is it genuine, and what does it say?
 *
 * Everything else — the SDK, the hash algorithm, the field names, the
 * encryption — is a driver's private business. `services/payments.ts` never
 * sees a gateway field name.
 *
 * ── verify() is the load-bearing method ────────────────────────────────
 *
 * §5 says never trust the frontend, and this interface is where that is made
 * structural rather than aspirational: `initiate()` and `parseWebhook()` both
 * return things that came from outside, and NEITHER of them settles anything.
 * The settlement transaction calls `verify()` and uses its answer alone. A
 * webhook's payload is used for one thing only — deciding that it is worth
 * calling `verify()`.
 *
 * That is why `parseWebhook` returns a `paymentRef` and a hint rather than a
 * state to apply. A driver that could return "SUCCESS" from a parsed callback
 * body would be a driver that lets whoever can forge one callback pay for
 * their own building permission.
 */

/** What a driver is told when a payment is started. */
export type InitiateInput = {
  /** Our reference. The only identifier the gateway is given. */
  paymentRef: string;
  /** Rupees, as a string with two decimals — never a float across a wire. */
  amount: string;
  currency: 'INR';
  /** Shown on the gateway's own screen, so the payer recognises what this is. */
  description: string;
  applicationNumber: string;
  demandNumber: string;
  payer: {
    name: string;
    email: string;
    phone: string;
  };
  /** Where the gateway sends the browser afterwards. Absolute URL. */
  returnUrl: string;
  /** Where the gateway posts its callback. Absolute URL. */
  webhookUrl: string;
};

/**
 * What a driver hands back.
 *
 * `redirectUrl` is a hosted-checkout gateway. `formPost` is the older style —
 * a target and a set of fields the browser must POST — which is how PayU and
 * CCAvenue work, and which cannot be expressed as a plain redirect. Supporting
 * both here is what stops a future PayU integration from needing a change to
 * the initiate route.
 */
export type InitiateResult = {
  /** The gateway's own handle for the attempt, if it issues one up front. */
  providerOrderId?: string;
  redirectUrl?: string;
  formPost?: {
    action: string;
    /** Already signed by the driver. Never assembled by a caller. */
    fields: Record<string, string>;
  };
  /** State the driver wants back at verify time. Secrets already stripped. */
  payload?: Record<string, unknown>;
};

/**
 * What `verify()` reports.
 *
 * `amount` is what the GATEWAY says was paid, which is the number settlement
 * compares against the demand. A driver that cannot report an amount returns
 * null and the settlement refuses — an unverifiable amount is not a reason to
 * credit an unknown sum.
 */
export type ProviderStatus = {
  state: ProviderState;
  /** The gateway's transaction id, once it has one. */
  gatewayTxnId?: string;
  bankRef?: string;
  /** UPI, CARD, NETBANKING… as reported. Normalised by the driver. */
  method?: string;
  /** Rupees with two decimals, as the gateway states it. */
  amount?: string | null;
  /** The gateway's own words on a failure, for the attempt log. */
  message?: string;
  /** Verbatim provider payload, secrets stripped, stored for forensics. */
  raw?: unknown;
};

/**
 * A verified callback.
 *
 * `externalId` is the provider's id FOR THE EVENT, not for the payment — it is
 * what `payment_webhook_events (provider, externalId)` is unique on, and so it
 * is what makes a redelivery a no-op. A driver whose provider does not supply
 * one must derive a stable id from the payload; deriving a fresh one per
 * delivery would silently disable duplicate protection.
 */
export type WebhookEvent = {
  externalId: string;
  /** The provider's event name, kept verbatim. */
  eventType: string;
  /** Our reference, recovered from the payload. Empty if unrecoverable. */
  paymentRef: string;
  /**
   * What the callback appears to say. A HINT — it decides whether verify() is
   * worth calling, and nothing else. It never becomes a payment status.
   */
  hint: ProviderState;
  /** The payload as received, secrets stripped, stored verbatim. */
  payload: Record<string, unknown>;
};

export type RefundResult = {
  externalRef: string;
  state: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  message?: string;
};

export interface PaymentProvider {
  readonly name: string;
  /**
   * False when the driver is selected but unusable — no key, no secret. Checked
   * before a payment row is written, so a misconfigured gateway produces a
   * clear refusal rather than a payment stuck at INITIATED for ever.
   */
  readonly configured: boolean;
  /**
   * True when no real money moves. Drives the "DEMO PAYMENT — NO MONEY HAS
   * CHANGED HANDS" banner on the receipt and the equivalent label in the UI.
   * Provenance is also recorded per attempt in `payments.provider`, so this is
   * answerable years later.
   */
  readonly isDemo: boolean;

  initiate(input: InitiateInput): Promise<InitiateResult>;

  /**
   * The authoritative question, asked server to server.
   *
   * THE ONLY THING THAT MAY SETTLE A PAYMENT. Called from inside the
   * settlement transaction, with the payment row held FOR UPDATE.
   *
   * Throwing means "I could not ask" — the sweep tries again. Returning
   * PENDING means "I asked, and it is not finished". The two are different and
   * must not be conflated: a network failure that returned PENDING would look
   * exactly like a gateway that had not been paid, and after enough of them
   * the attempt would time out a payment that had actually succeeded.
   */
  verify(paymentRef: string, hint?: Record<string, unknown>): Promise<ProviderStatus>;

  /**
   * Parses and VERIFIES a provider-initiated callback.
   *
   * Signature verification is not optional. A driver that cannot verify a
   * signature must throw rather than return an unverified event — an
   * unauthenticated endpoint that credits a demand is an endpoint that lets
   * anyone pay for their own building permission with an HTTP request.
   */
  parseWebhook(req: Request): Promise<WebhookEvent>;

  /** Phase 6. Optional, because not every gateway supports it the same way. */
  refund?(paymentRef: string, amount: string, reason: string): Promise<RefundResult>;
}
