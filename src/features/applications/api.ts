'use client';

import type { ApiErrorBody } from './types';

/**
 * One fetch wrapper behind every application mutation.
 *
 * The point is that FAILURE has a shape. Every screen needs the same three
 * things from a failed call — a sentence to show, field errors to attach to
 * inputs, and a way to tell "the server said no" from "the server was not
 * there" — and hand-rolling that at each call site is how one of the three
 * quietly gets dropped.
 *
 * A network failure is deliberately NOT the same as a 500: "check your
 * connection" is useless advice when the connection is fine and the server is
 * broken, and vice versa.
 */

export class ApiCallError extends Error {
  readonly status: number;
  readonly code: string;
  /** Field-level detail, pathed as the server sent it. */
  readonly details: Array<{ path: string; message: string }>;
  /** True when the request never reached the server. */
  readonly offline: boolean;

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: Array<{ path: string; message: string }>; offline?: boolean } = {}
  ) {
    super(message);
    this.name = 'ApiCallError';
    this.status = options.status ?? 0;
    this.code = options.code ?? 'UNKNOWN';
    this.details = options.details ?? [];
    this.offline = options.offline ?? false;
  }

  /** Field errors keyed by path, ready to hand to react-hook-form. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const detail of this.details) {
      if (detail.path && !out[detail.path]) out[detail.path] = detail.message;
    }
    return out;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiCallError('Could not reach the server. Check your connection and try again.', {
      offline: true,
    });
  }

  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => null)) as (ApiErrorBody & T) | null;

  if (!res.ok) {
    throw new ApiCallError(body?.error ?? 'That did not work. Try again shortly.', {
      status: res.status,
      code: body?.code,
      details: body?.details,
    });
  }

  return body as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
};
