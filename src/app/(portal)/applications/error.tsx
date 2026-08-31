'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';

/**
 * The applications area's error boundary.
 *
 * Scoped here rather than left to the global handler so a failure inside the
 * register keeps the sidebar and the shell — the person can navigate away
 * instead of being dropped onto a bare page. `reset()` re-runs the server
 * component, which is the right retry for a transient database blip.
 */
export default function ApplicationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the key into the server log. The user never sees a stack.
    console.error('[applications] render error', error);
  }, [error]);

  return (
    <div className="rounded border border-border bg-surface">
      <ErrorState
        title="Applications could not be loaded"
        description={
          'Something went wrong fetching the register. The problem has been logged' +
          (error.digest ? ` under reference ${error.digest}` : '') +
          '.'
        }
        onRetry={reset}
      />
      <div className="flex justify-center pb-8">
        <Button asChild variant="ghost">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
