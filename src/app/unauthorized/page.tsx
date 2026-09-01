import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Not permitted' };

/**
 * Reached when a signed-in user lacks the capability for a page.
 *
 * Says plainly that the limit is their ROLE, not that the page is missing —
 * a 404 here would send someone hunting for a broken link.
 */
export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-danger-bg">
          <ShieldX className="size-6 text-danger" />
        </div>

        <h1 className="text-h1 text-text">You do not have access to this page</h1>
        <p className="mx-auto mt-2 max-w-[46ch] text-small text-text-muted">
          Your role does not include this area. If you believe it should, ask your system
          administrator to review your role assignment.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="primary">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/admin/settings/profile">View my profile</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
