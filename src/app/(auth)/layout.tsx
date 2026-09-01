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
    <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-gradient-to-b from-slate-50 via-slate-100/60 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Decorative ambient gradients */}
      <div className="pointer-events-none absolute -left-40 -top-40 size-96 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-600/10" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 size-96 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-600/10" />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-700 text-white shadow-xl shadow-blue-500/25 ring-4 ring-white/60 dark:ring-slate-800/60">
              <Building className="size-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">{env.appName}</h1>
            <p className="mt-1.5 text-small font-medium text-text-muted">
              Online Building Permission & Scrutiny Management
            </p>
          </div>

          {children}
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/60 bg-surface/40 px-4 py-3.5 text-center text-caption text-text-subtle backdrop-blur-sm">
        <p>
          {env.appName} · {env.orgShortName} &nbsp;|&nbsp; Municipal Administration &amp; Urban Development
        </p>
      </footer>
    </div>
  );
}
