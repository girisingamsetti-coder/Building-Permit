import 'server-only';

/**
 * The error envelope every failing route returns:
 *
 *   { "error": "Human-readable sentence.",
 *     "code": "GUARD_FAILED",
 *     "details": [{ "path": "documents", "message": "3 mandatory documents missing" }] }
 *
 * Messages are written for the person reading them, not for the developer who
 * wrote the throw. A raw stack never reaches a client.
 */

export type ErrorDetail = { path: string; message: string };

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'GUARD_FAILED'
  | 'STALE_WRITE'
  | 'DUPLICATE'
  | 'BUSINESS_RULE'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL';

/**
 * The brand that makes an ApiError recognisable across module instances.
 *
 * `Symbol.for` looks up the process-wide registry, so two copies of THIS
 * MODULE still produce the same symbol — which is the whole point, because two
 * copies is a thing that actually happens here.
 *
 * Next bundles server code into more than one layer. A module reached from a
 * React Server Component and the same module reached from a route handler can
 * be two distinct instances with two distinct `ApiError` classes, and an error
 * constructed in one layer then fails `instanceof` in the other. That is not
 * hypothetical: the payment drivers are cached on `globalThis`, so the driver
 * a webhook route uses may well have been constructed while a page rendered —
 * and a signature failure that should be a 400 came back as a 500, on the one
 * unauthenticated endpoint in the system that touches money.
 *
 * A branded property is checked structurally and cannot be fooled by layering.
 */
const API_ERROR_BRAND = Symbol.for('lams.http.ApiError');

export class ApiError extends Error {
  readonly [API_ERROR_BRAND] = true as const;
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[];
  /** Seconds the client should wait. Only set for 429. */
  readonly retryAfter?: number;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details: ErrorDetail[] = [],
    retryAfter?: number
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details.length ? { details: this.details } : {}),
    };
  }
}

/**
 * Recognises an ApiError however it was constructed.
 *
 * Use this rather than `instanceof` at every boundary that maps an error to a
 * status code — see the brand above for why `instanceof` is not sufficient.
 */
export function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<symbol, unknown>)[API_ERROR_BRAND] === true
  );
}

export const badRequest = (message = 'Some of the details are not valid.', details: ErrorDetail[] = []) =>
  new ApiError(400, 'VALIDATION_FAILED', message, details);

export const unauthorized = (message = 'Your session has expired. Please sign in again.') =>
  new ApiError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'You are not permitted to do this.') =>
  new ApiError(403, 'FORBIDDEN', message);

export const notFound = (message = 'That could not be found.') => new ApiError(404, 'NOT_FOUND', message);

export const conflict = (message: string, code: ErrorCode = 'CONFLICT') => new ApiError(409, code, message);

/**
 * A workflow guard refused the action. The message names the guard in plain
 * language, because the officer needs to know *why*, not just *no*.
 */
export const guardFailed = (message: string, details: ErrorDetail[] = []) =>
  new ApiError(409, 'GUARD_FAILED', message, details);

export const staleWrite = (
  message = 'This application has moved on since you opened it. Reload to see the current state.'
) => new ApiError(409, 'STALE_WRITE', message);

export const businessRule = (message: string, details: ErrorDetail[] = []) =>
  new ApiError(422, 'BUSINESS_RULE', message, details);

export const rateLimited = (retryAfterSeconds: number, message = 'Too many attempts. Try again shortly.') =>
  new ApiError(429, 'RATE_LIMITED', message, [], retryAfterSeconds);

export const tooLarge = (message = 'That file is larger than the limit for this document type.') =>
  new ApiError(413, 'PAYLOAD_TOO_LARGE', message);

export const serviceUnavailable = (message = 'That service is not available right now. Try again shortly.') =>
  new ApiError(503, 'SERVICE_UNAVAILABLE', message);

/**
 * Turns an infrastructure failure into a sentence a user can act on, without
 * leaking connection strings or table names.
 */
export function describeInfrastructureFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/ECONNREFUSED|Can't reach database|connection.*(refused|closed)/i.test(message)) {
    return 'The service cannot reach its database right now. Try again in a moment.';
  }
  if (/timeout|ETIMEDOUT/i.test(message)) {
    return 'That took too long to complete. Try again in a moment.';
  }
  return 'Something went wrong at our end. The problem has been logged.';
}
