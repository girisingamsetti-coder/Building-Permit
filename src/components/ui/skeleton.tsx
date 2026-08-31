import { cn } from '@/lib/utils';

/**
 * Loading placeholder. `motion-safe` so the pulse respects a reduced-motion
 * preference rather than animating regardless.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('motion-safe:animate-pulse rounded bg-surface-sunk', className)}
      aria-hidden
      {...props}
    />
  );
}
