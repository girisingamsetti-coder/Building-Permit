'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [done, setDone] = React.useState(false);
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  async function onSubmit(values: ResetPasswordInput) {
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not change your password. Request a new link.');
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
  }

  if (done) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-success-bg">
          <CheckCircle2 className="size-5 text-success" />
        </div>
        <div>
          <p className="text-body font-medium text-text">Password changed</p>
          <p className="mt-1 text-small text-text-muted">
            Every other session has been signed out. Taking you to sign in…
          </p>
        </div>
        <Button asChild variant="primary" className="w-full">
          <Link href="/login">Sign in</Link>
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

      <input type="hidden" {...register('token')} />

      <Field
        label="New password"
        htmlFor="password"
        error={errors.password?.message}
        hint="At least 10 characters, including a letter and a number."
        required
      >
        <div className="relative">
          <Input
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            className="pr-10"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-text-muted hover:bg-surface-sunk hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
        <Input
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          invalid={Boolean(errors.confirmPassword)}
          {...register('confirmPassword')}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
        Change password
      </Button>
    </form>
  );
}
