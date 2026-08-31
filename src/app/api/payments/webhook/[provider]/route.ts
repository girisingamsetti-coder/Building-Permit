import { defineRoute, json } from '@/server/http/route';
import { handleWebhook } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/**
 * A gateway calling us back.
 *
 * ── Unauthenticated, and that is not a gap ─────────────────────────────
 *
 * A gateway has no session with us and never will — which is also why
 * `/api/payments/webhook` is on the middleware's public list, alongside
 * sign-in and the health check. Authentication here is the SIGNATURE on the
 * payload, checked by the driver before this route learns anything about the
 * event, and a driver that cannot verify a signature refuses rather than
 * trusting. There is no code path from an unsigned request to a credited
 * demand.
 *
 * ── Why the provider is in the URL ─────────────────────────────────────
 *
 * So a late callback for a payment taken under a gateway the department has
 * since switched away from is still verifiable, by the driver that took it.
 * Matching on the configured driver instead would silently drop exactly the
 * events a migration produces.
 *
 * ── Why almost everything is a 200 ─────────────────────────────────────
 *
 * Gateways retry on a non-2xx, with backoff, for hours. A duplicate delivery,
 * an event naming a payment we do not have, and a settlement that failed on
 * our side are ALL handled inside `handleWebhook` and acknowledged: retrying
 * them would achieve nothing and would turn our own bug into a flood.
 *
 * Only two things throw, and both should: an unknown gateway name (404) and a
 * signature that does not verify (400). Acknowledging a forgery would be
 * telling a forger it was accepted. Neither is caught here — `defineRoute`
 * maps an ApiError to its own status, which is the same handling every other
 * route gets, rather than a second error path to keep in step with the first.
 *
 * Rate-limited by IP: this is the only unauthenticated write endpoint in the
 * system that touches money.
 */
export const POST = defineRoute(
  async ({ req, params }) => json(await handleWebhook(params.provider!, req)),
  { auth: false, rateLimit: 'webhook' }
);
