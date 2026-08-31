'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck, ArrowLeft } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok && res.status !== 200) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Could not send the reset link. Try again shortly.');
        return;
      }
      setSent(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
  }

  // Deliberately identical whether or not the address exists: the screen must
  // not reveal which email addresses have accounts.
  if (sent) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-success-bg">
          <MailCheck className="size-5 text-success" />
        </div>
        <div>
          <p className="text-body font-medium text-text">Check your email</p>
          <p className="mx-auto mt-1 max-w-[42ch] text-small text-text-muted">
            If that address has an account, a reset link is on its way. The link is valid for
            30 minutes and can be used once.
          </p>
        </div>
        <Button asChild variant="secondary" className="w-full">
          <Link href="/login">
            <ArrowLeft className="size-4" />
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && (
        <p role="alert" className="rounded border border-danger/30 bg-danger-bg px-3 py-2 text-small text-danger">
          {error}
        </p>
      )}

      <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
        <Input
          type="email"
          autoComplete="username"
          autoFocus
          placeholder="you@example.com"
          invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
        Send reset link
      </Button>

      <Button asChild variant="ghost" className="w-full">
        <Link href="/login">
          <ArrowLeft className="size-4" />
          Back to sign in
        </Link>
      </Button>
    </form>
  );
}
