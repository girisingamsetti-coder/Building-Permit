import Link from 'next/link';
import { UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';

/**
 * Shown when a user id does not resolve — unknown, deleted, or malformed.
 *
 * Nested here rather than falling through to the root `not-found.tsx` so the
 * administrator keeps the shell and can navigate on, instead of being dropped
 * onto a bare full-page notice and having to use the browser's Back button.
 */
export default function UserNotFound() {
  return (
    <div className="rounded border border-border bg-surface">
      <EmptyState
        icon={UserX}
        title="User not found"
        description="No account here matches that reference. It may have been deleted, or the link may be wrong."
        action={
          <div className="flex gap-2">
            <Button asChild variant="primary">
              <Link href="/admin/settings/users">All users</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/admin">Administration</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
