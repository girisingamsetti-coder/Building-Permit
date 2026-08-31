import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A single number with a label. Optional tone bar encodes urgency in FORM as
 * well as colour, so what needs attention reads at a glance.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
  href,
  loading,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  href?: string;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const bar = {
    neutral: 'bg-border-strong',
    info: 'bg-info',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[tone];

  const body = (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded border border-border bg-surface p-4',
        href && 'transition-colors hover:border-border-strong hover:bg-surface-sunk'
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-0.5', bar)} aria-hidden />

      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <p className="truncate text-caption font-medium uppercase tracking-wide text-text-muted">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums text-text">{value}</p>
          )}
          {hint && <p className="mt-1.5 text-caption text-text-subtle">{hint}</p>}
        </div>
        {Icon && <Icon className="size-4 shrink-0 text-text-subtle" />}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {body}
    </Link>
  ) : (
    body
  );
}
