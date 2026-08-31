'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest links this screen to the server log entry without showing
    // the user a stack trace.
    console.error('[app] unhandled render error', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-danger-bg">
          <AlertTriangle className="size-6 text-danger" />
        </div>
        <h1 className="text-h1 text-text">Something went wrong</h1>
        <p className="mx-auto mt-2 max-w-[46ch] text-small text-text-muted">
          The problem has been logged. Try again — if it keeps happening, quote reference{' '}
          <span className="font-mono">{error.digest ?? 'n/a'}</span> to your administrator.
        </p>
        <Button variant="primary" className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
