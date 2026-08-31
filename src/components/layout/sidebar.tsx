'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building } from 'lucide-react';
import { visibleNav } from '@/lib/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Capability-filtered navigation.
 *
 * Items belonging to a later phase are shown but disabled, with the phase
 * named — an officer who can see "Tasks · Phase 7" understands the system is
 * incomplete, whereas a link that 404s reads as broken.
 */
export function Sidebar({
  capabilities,
  collapsed,
  onNavigate,
}: {
  capabilities: string[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = React.useMemo(() => visibleNav(capabilities), [capabilities]);

  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex h-full flex-col border-r border-border bg-surface',
        collapsed ? 'w-14' : 'w-60'
      )}
    >
      <div className={cn('flex h-14 items-center gap-2 border-b border-border px-3', collapsed && 'justify-center px-0')}>
        <div className="grid size-8 shrink-0 place-items-center rounded bg-primary text-primary-text">
          <Building className="size-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-small font-semibold leading-tight text-text">LAMS</p>
            <p className="truncate text-caption leading-tight text-text-subtle">Approval Management</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={cn(i > 0 && 'mt-5')}>
            {section.label && !collapsed && (
              <p className="px-2 pb-1.5 text-caption font-semibold uppercase tracking-wider text-text-subtle">
                {section.label}
              </p>
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                const disabled = Boolean(item.comingIn);

                const inner = (
                  <>
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && disabled && (
                      <span className="ml-auto shrink-0 text-caption text-text-subtle">{item.comingIn}</span>
                    )}
                  </>
                );

                const classes = cn(
                  'flex items-center gap-2.5 rounded px-2 py-1.5 text-small transition-colors',
                  collapsed && 'justify-center px-0',
                  disabled
                    ? 'cursor-not-allowed text-text-subtle'
                    : active
                      ? 'bg-primary-subtle font-medium text-primary'
                      : 'text-text-muted hover:bg-surface-sunk hover:text-text'
                );

                const node = disabled ? (
                  <span className={classes} aria-disabled>
                    {inner}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(classes, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary')}
                  >
                    {inner}
                  </Link>
                );

                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{node}</TooltipTrigger>
                        <TooltipContent side="right">
                          {item.label}
                          {item.comingIn ? ` · ${item.comingIn}` : ''}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      node
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
