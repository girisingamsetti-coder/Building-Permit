'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BUCKETS } from '@/lib/application-buckets';
import { statusMeta } from '@/lib/status';
import { STAGE_LABELS } from '@/lib/workflow';
import type { ApplicationMeta } from './types';

/**
 * The list's filters.
 *
 * THE URL IS THE STATE. Every control writes to the query string and the
 * server component re-renders from it. That buys four things a `useState`
 * filter bar does not have: a filtered list can be sent to a colleague or
 * bookmarked, the browser Back button behaves, `loading.tsx` shows while the
 * new page streams, and the numbers can never drift from the tiles that link
 * here — because a KPI tile is just a link to `?bucket=…`.
 *
 * Search is debounced; every other control commits immediately, because a
 * select has no intermediate state worth waiting through.
 */

/** Statuses offered individually. The full 36 would be a wall — buckets cover the rest. */
const COMMON_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'SCRUTINY_FAILED',
  'SCRUTINY_PASSED',
  'DOCUMENT_UPLOAD_PENDING',
  'PAYMENT_PENDING',
  'APPROVED',
  'REJECTED',
];

const ANY = '__any__';

/**
 * The desks a file can be sitting at.
 *
 * Read from the shared stage labels rather than re-listed, so a stage an
 * administrator adds to the workflow appears here without a code change — and
 * so the wording in this dropdown is the wording in the table's Stage column.
 */
const STAGE_OPTIONS = Object.entries(STAGE_LABELS);

const PAYMENT_OPTIONS: Array<[string, string]> = [
  ['none', 'No demand raised'],
  ['unpaid', 'Demand outstanding'],
  ['paid', 'Fully paid'],
  ['failed', 'An attempt was declined'],
  ['inflight', 'Payment in progress'],
];

const SCRUTINY_OPTIONS: Array<[string, string]> = [
  ['none', 'Not scrutinised'],
  ['running', 'Queued or running'],
  ['passed', 'Passed'],
  ['failed', 'Failed'],
];

const SHORTFALL_OPTIONS: Array<[string, string]> = [
  ['open', 'Has an open shortfall'],
  ['none', 'No open shortfall'],
  ['resolved', 'All shortfalls resolved'],
  ['document', 'Open document shortfall'],
  ['fee', 'Open fee shortfall'],
];

const SLA_OPTIONS: Array<[string, string]> = [
  ['ON_TRACK', 'On track'],
  ['DUE_SOON', 'Due soon'],
  ['OVERDUE', 'Overdue'],
  ['PAUSED', 'Paused'],
  ['COMPLETED', 'Completed'],
  ['none', 'No clock running'],
];

/** Every key the "Clear all" button must remove, and the count badge counts. */
const FILTER_KEYS = [
  'bucket',
  'status',
  'applicationTypeId',
  'zoneId',
  'stage',
  'payment',
  'scrutiny',
  'shortfall',
  'sla',
  'from',
  'to',
] as const;

export function ApplicationFilters({ meta, total }: { meta: ApplicationMeta; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const [query, setQuery] = React.useState(searchParams.get('q') ?? '');
  // Open the drawer if any of the filters it holds is already applied —
  // otherwise a shared link arrives showing a filtered list with no visible
  // reason for it.
  const [advanced, setAdvanced] = React.useState(() =>
    ['from', 'to', 'zoneId', 'stage', 'payment', 'scrutiny', 'shortfall', 'sla'].some((key) =>
      Boolean(searchParams.get(key))
    )
  );

  // The URL is authoritative: a Back navigation must move the text box too.
  const urlQuery = searchParams.get('q') ?? '';
  React.useEffect(() => setQuery(urlQuery), [urlQuery]);

  const apply = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || value === ANY) next.delete(key);
        else next.set(key, value);
      }

      // Any change to the filters invalidates the page number — staying on
      // page 4 of a newly filtered list usually lands on nothing.
      if (!('page' in changes)) next.delete('page');

      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams]
  );

  // Debounced so a five-word search is one request, not five.
  React.useEffect(() => {
    if (query === urlQuery) return;
    const timer = setTimeout(() => apply({ q: query || null }), 350);
    return () => clearTimeout(timer);
  }, [query, urlQuery, apply]);

  const bucket = searchParams.get('bucket') ?? '';
  const status = searchParams.get('status') ?? '';
  const typeId = searchParams.get('applicationTypeId') ?? '';
  const zoneId = searchParams.get('zoneId') ?? '';
  const stage = searchParams.get('stage') ?? '';
  const payment = searchParams.get('payment') ?? '';
  const scrutiny = searchParams.get('scrutiny') ?? '';
  const shortfall = searchParams.get('shortfall') ?? '';
  const sla = searchParams.get('sla') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  const activeCount = FILTER_KEYS.filter((key) => searchParams.get(key)).length;

  const clearAll = () =>
    apply(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])) as Record<string, null>);

  return (
    <div className="space-y-3">
      {/* ── Bucket chips: the same nine the dashboard counts ── */}
      <div className="flex flex-wrap gap-1.5">
        {BUCKETS.map((b) => {
          const active = b.key === 'total' ? !bucket : bucket === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => apply({ bucket: b.key === 'total' ? null : b.key, status: null })}
              aria-pressed={active}
              className={
                'rounded-sm border px-2.5 py-1 text-caption font-medium transition-colors ' +
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
                (active
                  ? 'border-primary bg-primary-subtle text-primary'
                  : 'border-border text-text-muted hover:border-border-strong hover:text-text')
              }
            >
              {b.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search number, applicant, survey no. or locality"
            aria-label="Search applications"
            className="pl-8 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Select value={status || ANY} onValueChange={(v) => apply({ status: v, bucket: null })}>
          <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All statuses</SelectItem>
            {COMMON_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusMeta('application', s).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeId || ANY} onValueChange={(v) => apply({ applicationTypeId: v })}>
          <SelectTrigger className="w-[13rem]" aria-label="Filter by application type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All types</SelectItem>
            {meta.types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={advanced ? 'secondary' : 'ghost'}
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
        >
          <SlidersHorizontal className="size-4" />
          More
          {activeCount > 0 && <Badge tone="info">{activeCount}</Badge>}
        </Button>

        {activeCount > 0 && (
          <Button variant="ghost" onClick={clearAll}>
            Clear all
          </Button>
        )}
      </div>

      {advanced && (
        <div className="grid gap-3 rounded border border-border bg-surface-sunk p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Zone" htmlFor="filter-zone">
            <Select value={zoneId || ANY} onValueChange={(v) => apply({ zoneId: v })}>
              <SelectTrigger id="filter-zone" aria-label="Filter by zone">
                <SelectValue placeholder="All zones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All zones</SelectItem>
                {meta.zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Workflow stage" htmlFor="filter-stage">
            <Select value={stage || ANY} onValueChange={(v) => apply({ stage: v })}>
              <SelectTrigger id="filter-stage" aria-label="Filter by workflow stage">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All stages</SelectItem>
                {STAGE_OPTIONS.map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Payment" htmlFor="filter-payment">
            <Select value={payment || ANY} onValueChange={(v) => apply({ payment: v })}>
              <SelectTrigger id="filter-payment" aria-label="Filter by payment state">
                <SelectValue placeholder="All payment states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All payment states</SelectItem>
                {PAYMENT_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Scrutiny" htmlFor="filter-scrutiny">
            <Select value={scrutiny || ANY} onValueChange={(v) => apply({ scrutiny: v })}>
              <SelectTrigger id="filter-scrutiny" aria-label="Filter by scrutiny outcome">
                <SelectValue placeholder="All scrutiny states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All scrutiny states</SelectItem>
                {SCRUTINY_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Shortfall" htmlFor="filter-shortfall">
            <Select value={shortfall || ANY} onValueChange={(v) => apply({ shortfall: v })}>
              <SelectTrigger id="filter-shortfall" aria-label="Filter by shortfall state">
                <SelectValue placeholder="All shortfall states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All shortfall states</SelectItem>
                {SHORTFALL_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Service standard" htmlFor="filter-sla">
            <Select value={sla || ANY} onValueChange={(v) => apply({ sla: v })}>
              <SelectTrigger id="filter-sla" aria-label="Filter by service standard">
                <SelectValue placeholder="All SLA states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All SLA states</SelectItem>
                {SLA_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Created from" htmlFor="filter-from">
            <Input
              id="filter-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => apply({ from: e.target.value || null })}
            />
          </Field>

          <Field label="Created to" htmlFor="filter-to">
            <Input
              id="filter-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => apply({ to: e.target.value || null })}
            />
          </Field>
        </div>
      )}

      <p className="text-caption text-text-muted" aria-live="polite">
        {pending ? 'Updating…' : `${total} ${total === 1 ? 'application' : 'applications'}`}
      </p>
    </div>
  );
}
