'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, type ChangePasswordInput } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { toast } from '@/components/ui/toast';

export function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: ChangePasswordInput) {
    setError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not change your password.');
        return;
      }
      reset();
      toast.success('Password changed', {
        description: 'Your other sessions have been signed out.',
      });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4" noValidate>
      {mustChange && (
        <p className="rounded border border-warning/30 bg-warning-bg px-3 py-2 text-small text-warning">
          You are using a temporary password. Set your own before continuing.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded border border-danger/30 bg-danger-bg px-3 py-2 text-small text-danger">
          {error}
        </p>
      )}

      <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message} required>
        <Input
          type="password"
          autoComplete="current-password"
          invalid={Boolean(errors.currentPassword)}
          {...register('currentPassword')}
        />
      </Field>

      <Field
        label="New password"
        htmlFor="password"
        error={errors.password?.message}
        hint="At least 10 characters, including a letter and a number."
        required
      >
        <Input
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
        <Input
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errors.confirmPassword)}
          {...register('confirmPassword')}
        />
      </Field>

      <Button type="submit" variant="primary" loading={isSubmitting}>
        Change password
      </Button>
    </form>
  );
}
