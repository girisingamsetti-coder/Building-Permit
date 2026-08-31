import { requirePageUser } from '@/server/auth/page-guard';
import { env } from '@/server/config/env';
import { AppShell } from '@/components/layout/app-shell';
import { Toaster } from '@/components/ui/toast';

/**
 * Every page under (portal) is authenticated, because this layout resolves the
 * user server-side and redirects if there isn't one. A child page cannot
 * forget to check.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();

  return (
    <>
      <AppShell
        user={{
          name: user.name,
          email: user.email,
          capabilities: user.capabilities,
          roleNames: user.roleNames,
        }}
        demoMode={env.demoMode}
      >
        {children}
      </AppShell>
      <Toaster />
    </>
  );
}
