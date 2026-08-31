'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Server-side pagination controls.
 *
 * Reports the ROW RANGE, not just the page number: "21–40 of 96" answers
 * "roughly where am I and how much is left", which a bare "Page 2 of 5" does
 * not. The count is announced politely so a screen-reader user hears the
 * result of navigating rather than having to go looking for it.
 */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  disabled = false,
  noun = 'result',
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  noun?: string;
}) {
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-caption text-text-muted" aria-live="polite">
        {total === 1 ? (
          <>1 {noun}</>
        ) : (
          <>
            <span className="tabular-nums">
              {first}–{last}
            </span>{' '}
            of <span className="tabular-nums">{total}</span> {noun}s
          </>
        )}
      </p>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>

          <span className="px-2 text-caption tabular-nums text-text-muted">
            Page {page} of {totalPages}
          </span>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= totalPages}
            aria-label="Next page"
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </nav>
      )}
    </div>
  );
}
