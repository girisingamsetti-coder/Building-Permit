import 'server-only';
import { env } from '@/server/config/env';
import { MockPaymentProvider } from './mock';
import { RazorpayProvider } from './razorpay';
import { PayUProvider } from './payu';
import { CCAvenueProvider } from './ccavenue';
import type { PaymentProvider } from './types';

export type {
  PaymentProvider,
  InitiateInput,
  InitiateResult,
  ProviderStatus,
  RefundResult,
  WebhookEvent,
} from './types';

/**
 * Resolves the configured payment driver.
 *
 * Business code imports `paymentProvider` — or, in the settlement path,
 * `currentProvider()` — and never a concrete class. That is what makes "the
 * application is not coupled to one gateway" a testable claim rather than an
 * aspiration: switching from the mock to Razorpay, PayU or CCAvenue is an
 * environment variable, and the integration suite proves the resulting
 * application state is identical either way.
 *
 * The registry is the ONLY place a gateway name appears outside its own driver
 * file. Adding a fifth is a case here, a file next to it, and a value in the
 * PAYMENT_PROVIDER enum — no service, route or component is touched.
 */

const DRIVERS: Record<string, () => PaymentProvider> = {
  mock: () => new MockPaymentProvider(),
  razorpay: () => new RazorpayProvider(),
  payu: () => new PayUProvider(),
  ccavenue: () => new CCAvenueProvider(),
};

function create(): PaymentProvider {
  const factory = DRIVERS[env.paymentProvider];
  // Unreachable through the env schema, which enumerates the four. Kept
  // because a misconfiguration should refuse loudly rather than silently fall
  // back to the mock — a deployment that quietly starts taking demo payments
  // is the worst failure this file could have.
  if (!factory) throw new Error(`Unknown PAYMENT_PROVIDER "${env.paymentProvider}".`);
  return factory();
}

const globalForPayments = globalThis as unknown as { paymentProvider?: PaymentProvider };

export const paymentProvider: PaymentProvider = globalForPayments.paymentProvider ?? create();

if (!env.isProduction) globalForPayments.paymentProvider = paymentProvider;

/**
 * Overrides the driver for the duration of a test.
 *
 * Exported rather than reached for via module mocking, so the swap is explicit
 * and reversible, and so the provider-independence test can run the same path
 * twice in one process.
 */
export function __setPaymentProviderForTests(provider: PaymentProvider | null): void {
  globalForPayments.paymentProvider = provider ?? create();
}

/** The live driver, re-read each call so a test override takes effect. */
export const currentProvider = (): PaymentProvider =>
  globalForPayments.paymentProvider ?? paymentProvider;

/**
 * The driver a webhook names in its URL.
 *
 * A callback route is addressed `/api/payments/webhook/:provider`, so a
 * gateway that is no longer the configured one can still deliver a late
 * callback for a payment it took — which is exactly the case that must not be
 * dropped when a department switches gateways. The parse and the settlement
 * still go through that driver's own signature check.
 */
export function providerByName(name: string): PaymentProvider | null {
  // The live driver first, so a test override is honoured for its own name.
  const live = currentProvider();
  if (live.name === name) return live;

  const factory = DRIVERS[name];
  return factory ? factory() : null;
}
