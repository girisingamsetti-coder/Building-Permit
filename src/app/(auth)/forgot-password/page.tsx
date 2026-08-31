import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-5">
          <h2 className="text-h1 text-text">Reset your password</h2>
          <p className="mt-1 text-small text-text-muted">
            Enter your email address and we will send you a link.
          </p>
        </div>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
