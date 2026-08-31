import 'server-only';
import { Prisma } from '@prisma/client';

/**
 * Decimal-safe JSON serialisation at the API edge.
 *
 * Prisma returns `Decimal` objects for money columns. `JSON.stringify` turns
 * those into `{"s":1,"e":4,"d":[33495]}`, which is useless to a client. Money
 * stays `Decimal` everywhere inside the server — only here does it become a
 * number, at the single boundary where it must.
 *
 * Dates become ISO strings; BigInt becomes a string; everything else passes
 * through untouched.
 */

export function serialize<T>(value: T): unknown {
  if (value === null || value === undefined) return value;

  if (Prisma.Decimal.isDecimal(value)) return num(value as unknown as Prisma.Decimal);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) return value.map(serialize);

  if (typeof value === 'object') {
    // Buffers and typed arrays are passed through rather than walked.
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialize(val);
    }
    return out;
  }

  return value;
}

/** Decimal → number. Use only where a JS number is genuinely wanted. */
export function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

/** number | string → Decimal, for writing money. */
export function dec(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
