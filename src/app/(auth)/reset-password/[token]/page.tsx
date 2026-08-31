import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui/card';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export const metadata: Metadata = { title: 'Set a new password' };
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-5">
          <h2 className="text-h1 text-text">Set a new password</h2>
          <p className="mt-1 text-small text-text-muted">
            Choose something you have not used here before.
          </p>
        </div>
        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}
