import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/server/config/env';
import { badRequest, serviceUnavailable } from '@/server/http/errors';
import type {
  ScrutinyAck,
  ScrutinyOutcome,
  ScrutinyProvider,
  ScrutinySubmission,
} from './types';

/**
 * A real scrutiny engine, reached over HTTP.
 *
 * No such engine is confirmed yet, so this is written to a plausible contract
 * rather than to a vendor's specification, and its job today is to prove the
 * architecture does not depend on the mock. The integration suite runs the
 * whole drawing → scrutiny → correction path against a stub speaking this
 * contract and asserts identical application state (docs P.7). If any service,
 * guard, route or component ever learns which driver is live, that test fails.
 *
 * `isDemo` is false: results from a real engine are labelled as real, and are
 * not watermarked.
 */

type WireIssue = {
  ruleCode?: string;
  code?: string;
  severity?: string;
  title?: string;
  description?: string;
  expectedValue?: string;
  actualValue?: string;
  layer?: string;
  locationHint?: Record<string, unknown>;
};

type WireResult = {
  status?: string;
  externalRef?: string;
  reference?: string;
  outcome?: string;
  summary?: string;
  checksRun?: number;
  checksPassed?: number;
  issues?: WireIssue[];
  retryAfterMs?: number;
};

export class HttpScrutinyProvider implements ScrutinyProvider {
  readonly name = 'http';
  readonly isDemo = false;

  get configured(): boolean {
    return Boolean(env.scrutinyHttpUrl);
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(env.scrutinyHttpApiKey ? { Authorization: `Bearer ${env.scrutinyHttpApiKey}` } : {}),
    };
  }

  private assertUsable(): void {
    if (this.configured) return;
    throw serviceUnavailable('The scrutiny engine is not configured (SCRUTINY_HTTP_URL is unset).');
  }

  async submit(input: ScrutinySubmission): Promise<ScrutinyAck> {
    this.assertUsable();

    const res = await fetch(`${env.scrutinyHttpUrl}/submit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input),
      // An engine that has not answered in a minute is an engine to retry,
      // not one to hold a worker on indefinitely.
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      // Thrown, so the job retries with backoff. A transport failure is not a
      // verdict on the drawing.
      throw new Error(`Scrutiny engine returned ${res.status} on submit.`);
    }

    const body = (await res.json()) as WireResult;

    if ((body.status ?? '').toUpperCase() === 'PENDING') {
      const ref = body.externalRef ?? body.reference;
      if (!ref) throw new Error('Scrutiny engine returned PENDING without a reference.');
      return { kind: 'pending', externalRef: ref, retryAfterMs: body.retryAfterMs ?? 5000 };
    }

    return { kind: 'terminal', outcome: normalise(body, input) };
  }

  async poll(externalRef: string, submission: ScrutinySubmission): Promise<ScrutinyOutcome | null> {
    this.assertUsable();

    const res = await fetch(
      `${env.scrutinyHttpUrl}/result/${encodeURIComponent(externalRef)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(30_000) }
    );

    // Still working. Not an error — the worker simply asks again later.
    if (res.status === 202 || res.status === 404) return null;
    if (!res.ok) throw new Error(`Scrutiny engine returned ${res.status} on poll.`);

    const body = (await res.json()) as WireResult;
    if ((body.status ?? '').toUpperCase() === 'PENDING') return null;

    return normalise(body, submission);
  }

  /**
   * Verifies a provider-initiated callback.
   *
   * The signature check is not optional. An unauthenticated endpoint that
   * writes a PASS onto an application is an endpoint that lets anyone pass
   * their own drawing, so a callback without a configured secret is refused
   * outright rather than trusted.
   */
  async parseCallback(req: Request): Promise<ScrutinyOutcome> {
    const secret = env.scrutinyCallbackSecret;
    if (!secret) {
      throw serviceUnavailable(
        'A scrutiny callback arrived but SCRUTINY_CALLBACK_SECRET is not set, so it cannot be verified.'
      );
    }

    const raw = await req.text();
    const provided = req.headers.get('x-scrutiny-signature') ?? '';
    const expected = createHmac('sha256', secret).update(raw).digest('hex');

    if (!safeEqual(provided, expected)) {
      throw badRequest('That callback signature is not valid.');
    }

    const body = JSON.parse(raw) as WireResult;
    return normalise(body, null);
  }
}

/**
 * Maps a provider's payload onto our shape.
 *
 * Defensive on purpose: this is the one place a third party's JSON becomes our
 * domain objects, and an engine that omits `checksRun` or spells severity
 * differently should degrade rather than corrupt a result. An unrecognised
 * severity becomes MINOR — reported, but not something that silently fails an
 * application on a typo.
 */
function normalise(body: WireResult, submission: ScrutinySubmission | null): ScrutinyOutcome {
  const issues = (body.issues ?? []).map((raw) => ({
    ruleCode: raw.ruleCode ?? raw.code ?? 'UNKNOWN',
    severity: normaliseSeverity(raw.severity),
    title: raw.title ?? 'Issue reported by the scrutiny engine',
    description: raw.description ?? '',
    expectedValue: raw.expectedValue ?? '',
    actualValue: raw.actualValue ?? '',
    layer: raw.layer ?? '',
    locationHint: raw.locationHint ?? {},
  }));

  const outcome = (body.outcome ?? '').toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';
  const checksRun = body.checksRun ?? issues.length;
  const checksPassed = body.checksPassed ?? Math.max(0, checksRun - issues.length);

  return {
    externalRef: body.externalRef ?? body.reference ?? submission?.requestId ?? '',
    outcome,
    summary: body.summary ?? `Scrutiny ${outcome === 'PASS' ? 'passed' : 'failed'}.`,
    checksRun,
    checksPassed: Math.min(checksPassed, checksRun),
    issues,
    raw: body,
  };
}

function normaliseSeverity(value: string | undefined): 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO' {
  const upper = (value ?? '').toUpperCase();
  return upper === 'CRITICAL' || upper === 'MAJOR' || upper === 'INFO' ? upper : 'MINOR';
}

/** Constant-time compare that does not leak length through an exception. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
