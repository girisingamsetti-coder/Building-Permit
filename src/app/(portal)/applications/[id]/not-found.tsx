import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';

/**
 * Reached when an application does not exist, OR when it exists and belongs to
 * somebody else.
 *
 * The two cases are deliberately indistinguishable. Telling an LTP "that
 * application exists but is not yours" confirms which application numbers are
 * real, which is exactly what an enumeration attack is looking for. The
 * wording below is therefore careful to claim nothing either way.
 */
export default function ApplicationNotFound() {
  return (
    <div className="rounded border border-border bg-surface">
      <EmptyState
        icon={FileQuestion}
        title="Application not found"
        description="No application here matches that reference. Check the number, or open it from your list."
        action={
          <div className="flex gap-2">
            <Button asChild variant="primary">
              <Link href="/applications">My applications</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
