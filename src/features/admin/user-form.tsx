'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Check } from 'lucide-react';
import { z } from 'zod';
import { createUserSchema, type CreateUserInput } from '@/lib/schemas/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

export type FormMeta = {
  roles: Array<{ key: string; name: string; description: string }>;
  departments: Array<{ id: string; code: string; name: string }>;
  offices: Array<{ id: string; code: string; name: string; departmentId: string | null; zoneId: string | null }>;
  zones: Array<{ id: string; code: string; name: string }>;
};

type FormInput = z.input<typeof createUserSchema>;

export function UserForm({ meta, defaults }: { meta: FormMeta; defaults?: Partial<FormInput> }) {
  const router = useRouter();
  const [generated, setGenerated] = React.useState<{ email: string; password: string } | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
    // Fields with a Zod .default() are optional going IN and guaranteed coming
    // OUT, so the form is typed with both shapes rather than pretending they
    // are the same.
  } = useForm<FormInput, unknown, CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      name: '',
      phone: '',
      designation: '',
      employeeCode: '',
      roleKey: 'LTP',
      zoneIds: [],
      ltpLicenceNo: '',
      ltpLicenceClass: '',
      firmName: '',
      ...defaults,
    },
  });

  const roleKey = watch('roleKey');
  const isLtp = roleKey === 'LTP';

  async function onSubmit(values: CreateUserInput) {
    setFormError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(data.error ?? 'Could not create the account.');
        return;
      }

      if (data.generatedPassword) {
        // Shown once. There is no second chance to read it, so it gets a modal
        // rather than a toast that disappears.
        setGenerated({ email: values.email, password: data.generatedPassword });
      } else {
        toast.success('User created', { description: values.email });
        router.push(`/admin/settings/users/${data.user.id}`);
      }
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError && (
          <p role="alert" className="rounded border border-danger/30 bg-danger-bg px-3 py-2 text-small text-danger">
            {formError}
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>How this person signs in and appears on the record.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" error={errors.name?.message} required>
              <Input autoFocus invalid={Boolean(errors.name)} {...register('name')} />
            </Field>

            <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
              <Input type="email" invalid={Boolean(errors.email)} {...register('email')} />
            </Field>

            <Field label="Mobile number" htmlFor="phone" error={errors.phone?.message}>
              <Input type="tel" placeholder="9876543210" invalid={Boolean(errors.phone)} {...register('phone')} />
            </Field>

            <Field label="Designation" htmlFor="designation" error={errors.designation?.message}>
              <Input {...register('designation')} />
            </Field>

            <Field label="Staff code" htmlFor="employeeCode" error={errors.employeeCode?.message}>
              <Input {...register('employeeCode')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role and posting</CardTitle>
            <CardDescription>
              The role decides what this account may do. Zone decides which applications it can see.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" htmlFor="roleKey" error={errors.roleKey?.message} required>
              <Controller
                control={control}
                name="roleKey"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="roleKey" invalid={Boolean(errors.roleKey)}>
                      <SelectValue placeholder="Choose a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.roles.map((role) => (
                        <SelectItem key={role.key} value={role.key}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field label="Office" htmlFor="officeId" error={errors.officeId?.message}>
              <Controller
                control={control}
                name="officeId"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="officeId">
                      <SelectValue placeholder="Choose an office" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.offices.map((office) => (
                        <SelectItem key={office.id} value={office.id}>
                          {office.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field
              label="Primary zone"
              htmlFor="primaryZoneId"
              hint="Zonal officers see only applications in their zones."
              error={errors.primaryZoneId?.message}
            >
              <Controller
                control={control}
                name="primaryZoneId"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="primaryZoneId">
                      <SelectValue placeholder="Choose a zone" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.zones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </CardContent>
        </Card>

        {isLtp && (
          <Card>
            <CardHeader>
              <CardTitle>Licence details</CardTitle>
              <CardDescription>
                Recorded but not enforced — no external licence register has been supplied (Q15).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Licence number" htmlFor="ltpLicenceNo" error={errors.ltpLicenceNo?.message}>
                <Input placeholder="LTP/2026/0001" {...register('ltpLicenceNo')} />
              </Field>
              <Field label="Licence class" htmlFor="ltpLicenceClass" error={errors.ltpLicenceClass?.message}>
                <Input placeholder="Class-I" {...register('ltpLicenceClass')} />
              </Field>
              <Field label="Firm name" htmlFor="firmName" error={errors.firmName?.message}>
                <Input {...register('firmName')} />
              </Field>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Leave blank and the system generates one, shown to you once, which the user must change
              at first sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field
              label="Initial password"
              htmlFor="password"
              error={errors.password?.message}
              hint="Optional. At least 10 characters if set."
            >
              <Input type="text" autoComplete="off" invalid={Boolean(errors.password)} {...register('password')} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            Create user
          </Button>
        </div>
      </form>

      <GeneratedPasswordDialog
        value={generated}
        onClose={() => {
          setGenerated(null);
          router.push('/admin/settings/users');
        }}
      />
    </>
  );
}

function GeneratedPasswordDialog({
  value,
  onClose,
}: {
  value: { email: string; password: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy', { description: 'Select the password and copy it manually.' });
    }
  }

  return (
    <Dialog open={Boolean(value)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account created</DialogTitle>
          <DialogDescription>
            This password is shown once and is not stored in readable form. Copy it now and give it to{' '}
            {value?.email} through a channel you trust.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex items-center gap-2 rounded border border-border bg-surface-sunk px-3 py-2.5">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-body">{value?.password}</code>
            <Button size="sm" variant="secondary" onClick={copy} className="shrink-0">
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <p className="mt-3 text-caption text-text-muted">
            They will be asked to change it the first time they sign in.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
