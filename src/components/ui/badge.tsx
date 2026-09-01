import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tones carry FIXED meanings and are never used decoratively — a reviewer
 * learns the mapping once. See docs/06-frontend.md K.4.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium whitespace-nowrap transition-colors',
  {
    variants: {
      tone: {
        neutral: 'bg-neutral-bg text-neutral border border-border/80',
        info: 'bg-info-bg text-info border border-info/20',
        success: 'bg-success-bg text-success border border-success/20',
        warning: 'bg-warning-bg text-warning border border-warning/25',
        danger: 'bg-danger-bg text-danger border border-danger/25',
        purple: 'bg-purple-bg text-purple border border-purple/25',
        outline: 'border border-border bg-surface text-text-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
