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
        'flex h-full flex-col border-r border-border/80 bg-surface shadow-subtle',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className={cn('flex h-16 items-center gap-3 border-b border-border/70 px-4', collapsed && 'justify-center px-0')}>
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white shadow-md shadow-blue-500/20">
          <Building className="size-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-h2 font-bold tracking-tight text-text">LAMS</span>
              <span className="rounded-md bg-primary-subtle px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary">
                AP
              </span>
            </div>
            <p className="truncate text-caption text-text-muted">Building Permission Authority</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={cn(i > 0 && 'mt-6')}>
            {section.label && !collapsed && (
              <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-text-subtle/80">
                {section.label}
              </p>
            )}

            <ul className="space-y-1">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                const disabled = Boolean(item.comingIn);

                const inner = (
                  <>
                    <Icon className={cn('size-4 shrink-0 transition-colors', active ? 'text-primary' : 'text-text-muted')} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && disabled && (
                      <span className="ml-auto shrink-0 rounded bg-surface-sunk px-1.5 py-0.5 text-[10px] font-medium text-text-subtle">
                        {item.comingIn}
                      </span>
                    )}
                  </>
                );

                const classes = cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-small font-medium transition-all duration-150',
                  collapsed && 'justify-center px-0 py-2.5',
                  disabled
                    ? 'cursor-not-allowed text-text-subtle/50'
                    : active
                      ? 'bg-primary/10 font-semibold text-primary shadow-subtle'
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
                        <TooltipContent side="right" className="font-medium">
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
