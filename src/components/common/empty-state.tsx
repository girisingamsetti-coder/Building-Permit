import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Empty states name the action that fills them. "No results" alone tells a
 * user nothing they did not already know.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-3 rounded-full bg-surface-sunk p-3">
          <Icon className="size-5 text-text-subtle" />
        </div>
      )}
      <p className="text-body font-medium text-text">{title}</p>
      {description && <p className="mt-1 max-w-[46ch] text-small text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
