import { Building } from 'lucide-react';
import { env } from '@/server/config/env';

/**
 * The unauthenticated frame: a centred card on a plain ground.
 *
 * Restrained on purpose — this is a government service, and the page a citizen
 * or an officer meets first should read as official rather than as marketing.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="mb-3 grid size-12 place-items-center rounded-lg bg-primary text-primary-text">
              <Building className="size-6" />
            </div>
            <h1 className="text-h1 tracking-tight text-text">{env.appName}</h1>
            <p className="mt-1 text-small text-text-muted">Building permission approvals</p>
          </div>

          {children}
        </div>
      </main>

      <footer className="border-t border-border px-4 py-4 text-center text-caption text-text-subtle">
        {env.appName} · {env.orgShortName}
      </footer>
    </div>
  );
}
