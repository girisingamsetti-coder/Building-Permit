'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Global search.
 *
 * Disabled until Phase 2 gives it something to search. It is shown rather than
 * hidden because "/" is a habit worth teaching early — and it says plainly
 * what it is waiting for, instead of silently doing nothing.
 */
export function GlobalSearch() {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative hidden min-w-0 flex-1 md:block md:max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
      <input
        ref={inputRef}
        type="search"
        disabled
        placeholder="Search — available from Phase 2"
        aria-label="Search applications"
        className={cn(
          'h-8 w-full rounded border border-border bg-surface-sunk pl-8 pr-8 text-small text-text',
          'placeholder:text-text-subtle disabled:cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
        )}
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface px-1 text-[10px] text-text-subtle lg:block">
        /
      </kbd>
    </div>
  );
}
