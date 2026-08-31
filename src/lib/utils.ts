import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting a later Tailwind utility win over an earlier one
 * in the same group. Without this, `cn('p-2', 'p-4')` would emit both and the
 * result would depend on stylesheet order rather than call order.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "Priya Sharma" → "PS". Two letters at most; more is unreadable at 32px.
 *
 * Lives here rather than beside the Avatar component because it is a pure
 * string function and Avatar is a `'use client'` module. Exporting it from
 * there made it a client export, so a SERVER component that called it — the
 * admin user detail page did — failed at runtime in a production build with
 * "Attempted to call initials() from the server". `src/lib` is isomorphic, so
 * either side may call this.
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Is this string a UUID?
 *
 * Every service that resolves a row by id needs this, because a malformed id
 * must become the same 404 a genuinely missing row gets — handing it to
 * Postgres instead produces a failed uuid cast, which surfaces as a 500 and
 * tells a caller that the id was at least the right SHAPE.
 *
 * One copy, here, rather than the five identical regexes that had accumulated
 * across the services. A security-shaped regex maintained in five places is
 * five chances for one of them to drift — and this codebase has already had a
 * character class silently corrupted once (docs/09-delivery-plan.md, Phase 3).
 */
export const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/**
 * Rupees, the way an Indian government screen writes them.
 *
 * The lakh/crore grouping is not decoration: ₹1,25,00,000 and ₹12,500,000 are
 * the same number, and a clerk who reads the second one has to stop and count
 * digits. `en-IN` gets the grouping right, and the explicit currency display
 * keeps the symbol attached to the figure when it is copied out of the page.
 *
 * `maximumFractionDigits: 0` by default because a demand of ₹1,24,500.00 says
 * nothing the shorter form does not — the paise are shown on the demand and
 * the receipt, where they are the point, by passing `paise: true`.
 */
export function formatMoney(amount: number, options: { paise?: boolean } = {}): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: options.paise ? 2 : 0,
    maximumFractionDigits: options.paise ? 2 : 0,
  }).format(amount);
}

/**
 * A KPI tile has room for about eight characters, and ₹1,24,53,900 is eleven.
 * Abbreviating to the Indian scale keeps the number readable at a glance; the
 * exact figure belongs in the tile's hint or in the table underneath.
 */
export function formatMoneyCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `₹${(amount / 100_000).toFixed(2)} L`;
  if (abs >= 1_000) return `₹${(amount / 1_000).toFixed(1)}k`;
  return formatMoney(amount);
}

/** "3 days ago", "Yesterday", "12 Mar 2026" — one implementation, everywhere. */
export function formatRelativeTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
