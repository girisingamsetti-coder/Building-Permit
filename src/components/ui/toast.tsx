'use client';

import { Toaster as Sonner, toast } from 'sonner';

/**
 * Toasts.
 *
 * Every mutation ends in one naming what actually happened — "Published", not
 * "Success". Errors say what went wrong and how to fix it.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'rounded border border-border bg-surface text-text shadow-md text-small',
          description: 'text-text-muted',
          actionButton: 'bg-primary text-primary-text',
          error: 'border-danger/40',
          success: 'border-success/40',
        },
      }}
    />
  );
}

export { toast };
