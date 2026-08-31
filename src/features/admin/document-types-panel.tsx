'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { z } from 'zod';
import { Archive, FilePlus2, Pencil, RotateCcw } from 'lucide-react';
import { documentTypeSchema } from '@/lib/schemas/document-admin';
import { ALLOWED_UPLOAD_EXTENSIONS } from '@/lib/constants';
import { formatBytes } from '@/lib/documents';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

/**
 * The document catalogue, administered.
 *
 * Two things on this screen are load-bearing and easy to get wrong:
 *
 *   · The file-type list NARROWS the platform allow-list and can never widen
 *     it. The checkboxes are drawn from `ALLOWED_UPLOAD_EXTENSIONS` for that
 *     reason — an administrator cannot type `exe` into a box that only offers
 *     what the upload pipeline will accept anyway.
 *   · "Delete" means one of two different things, and the row says which
 *     before it is pressed. A type nothing references goes; a type an
 *     applicant has uploaded against is archived, because those documents are
 *     part of a municipal record and orphaning them would make an approved
 *     application unexplainable.
 */

export type DocumentTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  allowedExtensions: string[];
  maxSizeMb: number;
  requiresExpiry: boolean;
  isActive: boolean;
  deletedAt: string | null;
  requirementCount: number;
  documentCount: number;
  deletable: boolean;
};

type FormInput = z.input<typeof documentTypeSchema>;

export function DocumentTypesPanel({ types }: { types: DocumentTypeRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<DocumentTypeRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function remove(row: DocumentTypeRow) {
    const question = row.deletable
      ? `Delete ${row.name}? Nothing references it, so it will be removed outright.`
      : `Archive ${row.name}? ${row.requirementCount} rule(s) and ${row.documentCount} uploaded document(s) reference it, so it is kept for the record and taken out of every future checklist.`;

    if (!window.confirm(question)) return;

    setBusy(row.id);
    try {
      const res = await fetch(`/api/admin/document-types/${row.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? 'Could not remove that document type.');
        return;
      }

      toast.success(
        data.outcome === 'DELETED' ? `${row.name} deleted` : `${row.name} archived`,
        data.outcome === 'ARCHIVED'
          ? { description: 'Its requirement rules were deactivated with it.' }
          : undefined
      );
      router.refresh();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  async function restore(row: DocumentTypeRow) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/admin/document-types/${row.id}?restore=true`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Could not restore that document type.');
        return;
      }
      toast.success(`${row.name} restored`, {
        description: 'Its rules stay inactive until you turn them back on.',
      });
      router.refresh();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  const columns = React.useMemo<ColumnDef<DocumentTypeRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Document',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text">{row.original.name}</span>
              {row.original.deletedAt && <Badge tone="neutral">Archived</Badge>}
              {!row.original.deletedAt && !row.original.isActive && (
                <Badge tone="warning">Inactive</Badge>
              )}
            </div>
            <p className="truncate font-mono text-caption text-text-muted">{row.original.code}</p>
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Group',
        cell: ({ row }) => (
          <span className="text-small text-text-muted">{row.original.category || '—'}</span>
        ),
      },
      {
        id: 'file',
        header: 'Accepts',
        cell: ({ row }) => (
          <div className="text-small text-text-muted">
            <div className="flex flex-wrap gap-1">
              {row.original.allowedExtensions.map((e) => (
                <Badge key={e} tone="neutral">
                  .{e}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-caption">
              up to {formatBytes(row.original.maxSizeMb * 1024 * 1024)}
              {row.original.requiresExpiry && ' · expires'}
            </p>
          </div>
        ),
      },
      {
        id: 'usage',
        header: 'In use',
        cell: ({ row }) => (
          <div className="text-small text-text-muted">
            <p>
              {row.original.requirementCount} rule
              {row.original.requirementCount === 1 ? '' : 's'}
            </p>
            <p className="text-caption">
              {row.original.documentCount} uploaded
            </p>
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {row.original.deletedAt ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === row.original.id}
                onClick={() => restore(row.original)}
              >
                <RotateCcw className="size-4" />
                Restore
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditing(row.original)}>
                  <Pencil className="size-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === row.original.id}
                  onClick={() => remove(row.original)}
                >
                  <Archive className="size-4" />
                  {row.original.deletable ? 'Delete' : 'Archive'}
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    // `remove` and `restore` are stable for the life of the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-[70ch] text-small text-text-muted">
          What the system can ask an applicant for. Nothing here is hard-coded — the checklist on
          every application is derived from these rows and the rules on the next tab.
        </p>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <FilePlus2 className="size-4" />
          Add document type
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={types}
        emptyTitle="No document types yet"
        emptyDescription="Add one, then write a rule that says when it is required."
      />

      {creating && <TypeDialog onClose={() => setCreating(false)} />}
      {editing && <TypeDialog type={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TypeDialog({ type, onClose }: { type?: DocumentTypeRow; onClose: () => void }) {
  const router = useRouter();
  const editing = Boolean(type);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(documentTypeSchema),
    defaultValues: {
      code: type?.code ?? '',
      name: type?.name ?? '',
      description: type?.description ?? '',
      category: type?.category ?? '',
      allowedExtensions: type?.allowedExtensions ?? ['pdf'],
      maxSizeMb: type?.maxSizeMb ?? 10,
      requiresExpiry: type?.requiresExpiry ?? false,
      isActive: type?.isActive ?? true,
    },
  });

  const extensions = watch('allowedExtensions') ?? [];

  const toggleExtension = (ext: string) => {
    const current = new Set(extensions);
    if (current.has(ext)) current.delete(ext);
    else current.add(ext);
    setValue('allowedExtensions', [...current], { shouldValidate: true });
  };

  async function onSubmit(values: FormInput) {
    setFormError(null);
    try {
      const url = editing ? `/api/admin/document-types/${type!.id}` : '/api/admin/document-types';
      // The code is an identifier other rows point at, so it is never edited.
      const body = editing ? { ...values, code: undefined } : values;

      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(data.error ?? 'Could not save that document type.');
        return;
      }

      toast.success(editing ? 'Document type updated' : 'Document type created', {
        description: values.name,
      });
      router.refresh();
      onClose();
    } catch {
      setFormError('Could not reach the server.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${type!.name}` : 'Add a document type'}</DialogTitle>
            <DialogDescription>
              This describes the document. When it is required is a separate rule.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {formError && (
              <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-small text-danger">
                {formError}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Code"
                htmlFor="code"
                required
                error={errors.code?.message}
                hint={editing ? 'A code cannot change — rules and uploads point at it.' : 'e.g. SALE_DEED'}
              >
                <Input {...register('code')} disabled={editing} className="font-mono" />
              </Field>

              <Field label="Name" htmlFor="name" required error={errors.name?.message}>
                <Input {...register('name')} placeholder="Sale Deed" />
              </Field>
            </div>

            <Field
              label="Group"
              htmlFor="category"
              error={errors.category?.message}
              hint="Headed section on the applicant's checklist. Presentation only."
            >
              <Input {...register('category')} placeholder="Title and ownership" />
            </Field>

            <Field label="Description" htmlFor="description" error={errors.description?.message}>
              <Textarea {...register('description')} rows={2} />
            </Field>

            <Field
              label="Accepted file types"
              error={errors.allowedExtensions?.message}
              hint="Narrows what this document may be. It cannot widen what the system accepts anywhere."
            >
              <div className="flex flex-wrap gap-2">
                {ALLOWED_UPLOAD_EXTENSIONS.map((ext) => {
                  const on = extensions.includes(ext);
                  return (
                    <button
                      key={ext}
                      type="button"
                      onClick={() => toggleExtension(ext)}
                      aria-pressed={on}
                      className={
                        on
                          ? 'rounded-md border border-primary bg-primary-subtle px-3 py-1 text-small font-medium text-primary'
                          : 'rounded-md border border-border px-3 py-1 text-small text-text-muted hover:border-border-strong'
                      }
                    >
                      .{ext}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Maximum size (MB)"
                htmlFor="maxSizeMb"
                required
                error={errors.maxSizeMb?.message}
              >
                <Input type="number" min={1} max={100} {...register('maxSizeMb')} />
              </Field>

              <div className="space-y-4 pt-6">
                <label className="flex items-center gap-3 text-small">
                  <Switch
                    checked={watch('requiresExpiry') ?? false}
                    onCheckedChange={(v) => setValue('requiresExpiry', v)}
                  />
                  <span>
                    Has an expiry date
                    <span className="block text-caption text-text-muted">
                      The applicant is asked when it is valid until, and it stops counting after.
                    </span>
                  </span>
                </label>

                <label className="flex items-center gap-3 text-small">
                  <Switch
                    checked={watch('isActive') ?? true}
                    onCheckedChange={(v) => setValue('isActive', v)}
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
