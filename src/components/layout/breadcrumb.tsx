'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { breadcrumbsFor } from '@/lib/navigation';

export function Breadcrumb() {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-caption text-text-muted">
        <li className="flex items-center">
          <Link
            href="/dashboard"
            className="flex items-center justify-center rounded-md p-1 hover:bg-surface-sunk hover:text-text transition-colors"
            title="Dashboard"
          >
            <Home className="size-3.5" />
            <span className="sr-only">Dashboard</span>
          </Link>
        </li>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight className="size-3 shrink-0 text-text-subtle/70" aria-hidden />
              {last ? (
                <span className="truncate font-semibold text-text" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate rounded-md px-1.5 py-0.5 hover:bg-surface-sunk hover:text-text transition-colors"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
