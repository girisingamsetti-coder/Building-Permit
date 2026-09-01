import type { Metadata } from 'next';
import { Suspense } from 'react';
import { env } from '@/server/config/env';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Card className="rounded-2xl border-border/80 bg-surface/95 shadow-elevated backdrop-blur-sm">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-text">Sign in to your portal</h2>
          <p className="mt-1 text-small text-text-muted">
            Access building permission cases, scrutiny tasks, and fee orders.
          </p>
        </div>

        {/* useSearchParams needs a Suspense boundary during prerender. */}
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
          <LoginForm demoMode={env.demoMode} demoPassword={env.demoPassword} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
