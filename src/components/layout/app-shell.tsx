'use client';

import * as React from 'react';
import { PanelLeftClose, PanelLeft, Menu } from 'lucide-react';
import { Sidebar } from './sidebar';
import { Breadcrumb } from './breadcrumb';
import { GlobalSearch } from './global-search';
import { NotificationBell } from './notification-bell';
import { ProfileMenu } from './profile-menu';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ShellUser = {
  name: string;
  email: string;
  capabilities: string[];
  roleNames: string[];
};

/**
 * The authenticated frame.
 *
 * Responsive by structure rather than by hiding things: the sidebar is a
 * permanent rail from `lg` up and a drawer below it, so a phone gets the same
 * navigation rather than a reduced one.
 */
export function AppShell({
  user,
  demoMode,
  children,
}: {
  user: ShellUser;
  demoMode: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen bg-bg">
        {/* Permanent rail, large screens up. */}
        <aside className={cn('hidden lg:block', collapsed ? 'w-14' : 'w-60')}>
          <div className={cn('fixed inset-y-0 left-0 z-30', collapsed ? 'w-14' : 'w-60')}>
            <Sidebar capabilities={user.capabilities} collapsed={collapsed} />
          </div>
        </aside>

        {/* Drawer, below large. */}
        <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
          <DrawerContent side="left" className="w-60 max-w-[80vw] p-0">
            <DrawerTitle className="sr-only">Navigation</DrawerTitle>
            <Sidebar capabilities={user.capabilities} onNavigate={() => setMobileOpen(false)} />
          </DrawerContent>
        </Drawer>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeft /> : <PanelLeftClose />}
            </Button>

            <div className="hidden min-w-0 sm:block">
              <Breadcrumb />
            </div>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <GlobalSearch />

              {demoMode && (
                <Badge tone="warning" className="hidden sm:inline-flex">
                  Demo mode
                </Badge>
              )}

              <NotificationBell />
              <ProfileMenu name={user.name} email={user.email} roleNames={user.roleNames} />
            </div>
          </header>

          {demoMode && (
            <div className="border-b border-warning/30 bg-warning-bg px-4 py-1.5 text-caption text-warning">
              Demo mode — external services are mocked. Nothing here is a compliance decision, a real
              payment or a delivered message.
            </div>
          )}

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
