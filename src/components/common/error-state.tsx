'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Says what went wrong and offers the way out. No apologies, no stack traces.
 */
export function ErrorState({
  title = 'That did not load',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 rounded-full bg-danger-bg p-3">
        <AlertTriangle className="size-5 text-danger" />
      </div>
      <p className="text-body font-medium text-text">{title}</p>
      {description && <p className="mt-1 max-w-[46ch] text-small text-text-muted">{description}</p>}
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
