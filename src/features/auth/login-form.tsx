'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { DemoAccountPicker } from './demo-account-picker';

/**
 * Sign-in form.
 *
 * The Zod schema is the SAME object the API route validates with, so a field
 * the server rejects cannot be one the client accepted.
 */
export function LoginForm({ demoMode, demoPassword }: { demoMode: boolean; demoPassword: string }) {
  const params = useSearchParams();
  const next = params.get('next');

  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginInput) {
    setFormError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(
          data.error ?? 'Sign-in did not work. Check your details and try again.'
        );
        return;
      }

      // A full navigation rather than router.push, so every server component
      // re-renders with the new session rather than serving a cached anonymous
      // version.
      window.location.href = next ?? data.redirectTo ?? '/dashboard';
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    }
  }

  return (
    <div className="space-y-5">
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded border border-danger/30 bg-danger-bg px-3 py-2.5"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <p className="text-small text-danger">{formError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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

        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              className="pr-10"
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-text-muted hover:bg-surface-sunk hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-small text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </Button>
      </form>

      {demoMode && (
        <DemoAccountPicker
          demoPassword={demoPassword}
          onPick={(email) => {
            setValue('email', email, { shouldValidate: true });
            setValue('password', demoPassword, { shouldValidate: true });
            setFormError(null);
          }}
        />
      )}
    </div>
  );
}
