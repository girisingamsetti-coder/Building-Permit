import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export type KpiCardTone =
  | 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  | 'cyan' | 'blue' | 'emerald' | 'rose' | 'amber' | 'red' | 'orange' | 'indigo' | 'violet' | 'green' | 'fuchsia' | 'teal';

export function KpiCard({
  label,
  value,
  hint,
  trendValue,
  trendLabel,
  tone = 'neutral',
  href,
  loading,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  trendValue?: string;
  trendLabel?: string;
  tone?: KpiCardTone;
  href?: string;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string; fill?: string; strokeWidth?: number }>;
}) {
  const t = tone;
  const outerWrapper: Record<KpiCardTone, string> = {
    neutral: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#06B6D4]/50',
    info: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#3B82F6]/50',
    success: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#22C55E]/50',
    warning: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#F59E0B]/50',
    danger: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#A66FE4]/50',
    cyan: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#06B6D4]/50',
    blue: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#3B82F6]/50',
    emerald: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#10B981]/50',
    rose: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#F43F5E]/50',
    amber: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#F59E0B]/50',
    red: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#EF4444]/50',
    orange: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#F97316]/50',
    indigo: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#6366F1]/50',
    violet: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#8B5CF6]/50',
    green: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#22C55E]/50',
    fuchsia: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#D946EF]/50',
    teal: 'bg-gradient-to-br from-gray-200 via-gray-200/50 to-[#14B8A6]/50',
  };

  const innerBg: Record<KpiCardTone, string> = {
    neutral: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#06B6D4]/5 to-white to-50%',
    info: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#3B82F6]/5 to-white to-50%',
    success: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#22C55E]/5 to-white to-50%',
    warning: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#F59E0B]/5 to-white to-50%',
    danger: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#A66FE4]/5 to-white to-50%',
    cyan: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#06B6D4]/5 to-white to-50%',
    blue: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#3B82F6]/5 to-white to-50%',
    emerald: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#10B981]/5 to-white to-50%',
    rose: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#F43F5E]/5 to-white to-50%',
    amber: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#F59E0B]/5 to-white to-50%',
    red: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#EF4444]/5 to-white to-50%',
    orange: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#F97316]/5 to-white to-50%',
    indigo: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#6366F1]/5 to-white to-50%',
    violet: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#8B5CF6]/5 to-white to-50%',
    green: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#22C55E]/5 to-white to-50%',
    fuchsia: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#D946EF]/5 to-white to-50%',
    teal: 'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#14B8A6]/5 to-white to-50%',
  };

  const iconBg: Record<KpiCardTone, string> = {
    neutral: 'bg-[#06B6D4]/15 text-[#06B6D4]',
    info: 'bg-[#3B82F6]/15 text-[#3B82F6]',
    success: 'bg-[#22C55E]/15 text-[#22C55E]',
    warning: 'bg-[#F59E0B]/15 text-[#F59E0B]',
    danger: 'bg-[#A66FE4]/15 text-[#A66FE4]',
    cyan: 'bg-[#06B6D4]/15 text-[#06B6D4]',
    blue: 'bg-[#3B82F6]/15 text-[#3B82F6]',
    emerald: 'bg-[#10B981]/15 text-[#10B981]',
    rose: 'bg-[#F43F5E]/15 text-[#F43F5E]',
    amber: 'bg-[#F59E0B]/15 text-[#F59E0B]',
    red: 'bg-[#EF4444]/15 text-[#EF4444]',
    orange: 'bg-[#F97316]/15 text-[#F97316]',
    indigo: 'bg-[#6366F1]/15 text-[#6366F1]',
    violet: 'bg-[#8B5CF6]/15 text-[#8B5CF6]',
    green: 'bg-[#22C55E]/15 text-[#22C55E]',
    fuchsia: 'bg-[#D946EF]/15 text-[#D946EF]',
    teal: 'bg-[#14B8A6]/15 text-[#14B8A6]',
  };

  // Pill badge colors
  let trendBg = 'bg-gray-100 text-gray-700';
  if (trendValue) {
    if (trendValue.startsWith('+')) trendBg = 'bg-[#DCFCE7] text-[#16A34A]';
    else if (trendValue.startsWith('-')) trendBg = 'bg-[#FEE2E2] text-[#DC2626]';
  }

  const body = (
    <div
      className={cn(
        'relative h-full rounded-[20px] p-[1px] transition-all hover:-translate-y-0.5 hover:shadow-md shadow-sm',
        outerWrapper[tone],
        href && 'cursor-pointer'
      )}
    >
      <div className={cn("flex h-full flex-col justify-between rounded-[19px] p-5", innerBg[tone])}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold tracking-wide text-[#737373]">
              {label}
            </p>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
              <p className="mt-1 text-[32px] font-bold tracking-tight text-black">{value}</p>
            )}
          </div>
          {Icon && (
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-full', iconBg[tone])}>
              <Icon className="size-4" fill="currentColor" strokeWidth={2} />
            </div>
          )}
        </div>

        {(trendValue || hint) && (
          <div className="mt-4 flex items-center gap-2">
            {trendValue && (
              <span className={cn('rounded px-1.5 py-0.5 text-xs font-bold', trendBg)}>
                {trendValue}
              </span>
            )}
            <span className="text-xs text-[#8B8B8B]">
              {trendLabel || hint}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {body}
    </Link>
  ) : (
    body
  );
}
