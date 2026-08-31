import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-surface-sunk">
          <FileQuestion className="size-6 text-text-subtle" />
        </div>
        <h1 className="text-h1 text-text">Page not found</h1>
        <p className="mx-auto mt-2 max-w-[46ch] text-small text-text-muted">
          That address does not match anything here. It may have moved, or the link may be wrong.
        </p>
        <Button asChild variant="primary" className="mt-6">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
