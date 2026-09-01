'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function GlobalSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams?.get('q') ?? '';
  const [query, setQuery] = React.useState(initialQ);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setQuery(searchParams?.get('q') ?? '');
  }, [searchParams]);

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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/applications?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/applications');
    }
  }

  function handleClear() {
    setQuery('');
    inputRef.current?.focus();
  }

  return (
    <form
      onSubmit={handleSearch}
      role="search"
      className="relative hidden min-w-0 flex-1 md:block md:max-w-sm"
    >
      <button
        type="submit"
        aria-label="Submit search"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle transition-colors hover:text-primary focus-visible:outline-none"
      >
        <Search className="size-4" />
      </button>

      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search applications, files, applicants..."
        aria-label="Search applications"
        className={cn(
          'h-9 w-full rounded-lg border border-border/80 bg-surface-sunk/60 pl-8 pr-12 text-small text-text shadow-inner transition-all',
          'placeholder:text-text-subtle focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20',
          'focus-visible:outline-none'
        )}
      />

      {query ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-subtle hover:text-text focus-visible:outline-none"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border/70 bg-surface px-1.5 py-0.5 text-[10px] font-mono text-text-subtle lg:block">
          /
        </kbd>
      )}
    </form>
  );
}
