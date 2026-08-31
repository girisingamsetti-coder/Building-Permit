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
    <Card>
      <CardContent className="p-6">
        <div className="mb-5">
          <h2 className="text-h1 text-text">Sign in</h2>
          <p className="mt-1 text-small text-text-muted">
            Use the account issued to you by the department.
          </p>
        </div>

        {/* useSearchParams needs a Suspense boundary during prerender. */}
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LoginForm demoMode={env.demoMode} demoPassword={env.demoPassword} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
