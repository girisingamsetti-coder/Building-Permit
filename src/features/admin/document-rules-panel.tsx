'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
 * The requirement rules — when a document is asked for.
 *
 * ── Why the condition gets a live preview ──────────────────────────────
 *
 * A rule is JSON, and JSON is not a language anybody proofreads well. The
 * failure it invites is silent: `resolveRequirements` treats a condition it
 * cannot evaluate as NOT APPLYING, so a mistyped rule does not raise an error
 * anywhere — the document is simply never asked for, and the omission surfaces
 * months later as a file that reached an officer without a certificate.
 *
 * So the editor reads the rule back in the exact words the APPLICANT will see
 * — "required because the number of floors is at least 4" — and refuses to
 * save one the evaluator would choke on. A rule nobody can read is a rule
 * nobody can review.
 */

export type RuleRow = {
  id: string;
  applicationTypeId: string | null;
  documentTypeId: string;
  buildingUse: string;
  landUseZone: string;
  isMandatory: boolean;
  condition: unknown;
  displayOrder: number;
  helpText: string;
  isActive: boolean;
  explanation: string;
  conditionProblem: string | null;
  documentType: { id: string; code: string; name: string; category: string; deletedAt: string | null };
  applicationType: { id: string; code: string; name: string } | null;
};

export type RuleMeta = {
  documentTypes: Array<{ id: string; name: string; code: string; isActive: boolean }>;
  applicationTypes: Array<{ id: string; name: string; code: string }>;
};

const ANY = '__any__';

export function DocumentRulesPanel({ rules, meta }: { rules: RuleRow[]; meta: RuleMeta }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<RuleRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function remove(row: RuleRow) {
    if (
      !window.confirm(
        `Delete the rule that asks for ${row.documentType.name}? Documents already uploaded because of it are kept — they belong to the application, not to the rule.`
      )
    ) {
      return;
    }

    setBusy(row.id);
    try {
      const res = await fetch(`/api/admin/document-requirements/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Could not delete that rule.');
        return;
      }
      toast.success('Rule deleted');
      router.refresh();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  const columns = React.useMemo<ColumnDef<RuleRow, unknown>[]>(
    () => [
      {
        id: 'document',
        header: 'Asks for',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text">{row.original.documentType.name}</span>
              {row.original.isMandatory ? (
                <Badge tone="danger">Mandatory</Badge>
              ) : (
                <Badge tone="neutral">Optional</Badge>
              )}
              {!row.original.isActive && <Badge tone="warning">Off</Badge>}
            </div>
            <p className="truncate font-mono text-caption text-text-muted">
              {row.original.documentType.code}
            </p>
          </div>
        ),
      },
      {
        id: 'when',
        header: 'When',
        cell: ({ row }) => (
          <div className="max-w-[46ch] text-small">
            {row.original.conditionProblem ? (
              <span className="flex items-start gap-1.5 text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  This condition cannot be evaluated, so the document is never asked for.{' '}
                  {row.original.conditionProblem}
                </span>
              </span>
            ) : row.original.explanation ? (
              <span className="text-text-muted">{row.original.explanation}</span>
            ) : (
              <span className="text-text-muted">Always</span>
            )}
            {(row.original.buildingUse || row.original.landUseZone) && (
              <p className="mt-1 text-caption text-text-muted">
                {[row.original.buildingUse, row.original.landUseZone].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'scope',
        header: 'Applies to',
        cell: ({ row }) => (
          <span className="text-small text-text-muted">
            {row.original.applicationType?.name ?? 'Every application type'}
          </span>
        ),
      },
      {
        accessorKey: 'displayOrder',
        header: 'Order',
        cell: ({ row }) => (
          <span className="text-small tabular-nums text-text-muted">
            {row.original.displayOrder}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
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
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy]
  );

  const broken = rules.filter((r) => r.conditionProblem).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-[70ch] text-small text-text-muted">
          When each document is required. A rule with no condition applies to every application; a
          rule with one applies when it is true of the particulars that were filed.
        </p>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Add rule
        </Button>
      </div>

      {broken > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-small text-danger"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {broken} rule{broken === 1 ? '' : 's'} cannot be evaluated, so the document
            {broken === 1 ? ' it names is' : 's they name are'} never asked for. Fix or deactivate
            {broken === 1 ? ' it' : ' them'}.
          </span>
        </p>
      )}

      <DataTable
        columns={columns}
        data={rules}
        emptyTitle="No requirement rules"
        emptyDescription="Without a rule, no document is ever asked for."
      />

      {creating && <RuleDialog meta={meta} onClose={() => setCreating(false)} />}
      {editing && <RuleDialog meta={meta} rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type Preview = {
  valid: boolean;
  explanation: string;
  always: boolean;
  problems: Array<{ path: string; message: string }>;
};

function RuleDialog({
  rule,
  meta,
  onClose,
}: {
  rule?: RuleRow;
  meta: RuleMeta;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(rule);

  const [documentTypeId, setDocumentTypeId] = React.useState(rule?.documentTypeId ?? '');
  const [applicationTypeId, setApplicationTypeId] = React.useState(rule?.applicationTypeId ?? '');
  const [isMandatory, setIsMandatory] = React.useState(rule?.isMandatory ?? true);
  const [isActive, setIsActive] = React.useState(rule?.isActive ?? true);
  const [displayOrder, setDisplayOrder] = React.useState(String(rule?.displayOrder ?? 100));
  const [helpText, setHelpText] = React.useState(rule?.helpText ?? '');
  const [buildingUse, setBuildingUse] = React.useState(rule?.buildingUse ?? '');
  const [landUseZone, setLandUseZone] = React.useState(rule?.landUseZone ?? '');
  const [condition, setCondition] = React.useState(
    rule?.condition && Object.keys(rule.condition as object).length
      ? JSON.stringify(rule.condition, null, 2)
      : ''
  );

  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // The preview is the whole point of the editor, so it runs as they type —
  // debounced, because each keystroke would otherwise be a request.
  React.useEffect(() => {
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/document-requirements/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ condition }),
        });
        if (res.ok) setPreview(await res.json());
      } catch {
        // A preview that cannot be fetched simply does not appear. The save
        // path validates again on the server, so nothing unsafe gets through.
        setPreview(null);
      }
    }, 350);

    return () => clearTimeout(handle);
  }, [condition]);

  async function save() {
    setFormError(null);

    if (!documentTypeId) {
      setFormError('Choose which document this rule asks for.');
      return;
    }

    setSaving(true);
    try {
      const url = editing
        ? `/api/admin/document-requirements/${rule!.id}`
        : '/api/admin/document-requirements';

      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentTypeId,
          applicationTypeId: applicationTypeId || '',
          buildingUse,
          landUseZone,
          isMandatory,
          condition,
          displayOrder,
          helpText,
          isActive,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Field-level detail, when the server sent it — a condition error
        // belongs next to the condition, not in a toast that vanishes.
        const detail = Array.isArray(data.details) ? data.details[0]?.message : null;
        setFormError(detail ?? data.error ?? 'Could not save that rule.');
        return;
      }

      toast.success(editing ? 'Rule updated' : 'Rule created');
      router.refresh();
      onClose();
    } catch {
      setFormError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  const usableTypes = meta.documentTypes.filter((t) => t.isActive || t.id === documentTypeId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit rule' : 'Add a requirement rule'}</DialogTitle>
          <DialogDescription>
            A rule says WHEN a document is required. The checklist on every application is derived
            from these — no deploy, no migration.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-small text-danger">
              {formError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Document" htmlFor="documentTypeId" required>
              <Select value={documentTypeId} onValueChange={setDocumentTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a document" />
                </SelectTrigger>
                <SelectContent>
                  {usableTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Application type"
              htmlFor="applicationTypeId"
              hint="Leave as Any to apply to every kind of permission."
            >
              <Select
                value={applicationTypeId || ANY}
                onValueChange={(v) => setApplicationTypeId(v === ANY ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any application type</SelectItem>
                  {meta.applicationTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            label="Condition"
            htmlFor="condition"
            hint='Leave empty to always apply. Example: { "gte": ["building.numFloors", 4] }'
          >
            <Textarea
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              rows={5}
              className="font-mono text-small"
              placeholder="{}"
            />
          </Field>

          {/* The rule, read back in the applicant's words. */}
          <div
            className={
              preview && !preview.valid
                ? 'rounded-md bg-danger-subtle px-3 py-2 text-small text-danger'
                : 'rounded-md bg-surface-subtle px-3 py-2 text-small'
            }
          >
            {preview === null ? (
              <span className="text-text-muted">Checking…</span>
            ) : !preview.valid ? (
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{preview.problems[0]?.message ?? 'That condition cannot be evaluated.'}</span>
              </span>
            ) : preview.always || !preview.explanation ? (
              <span className="flex items-start gap-2 text-text-muted">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <span>Applies to every application.</span>
              </span>
            ) : (
              <span className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <span>
                  The applicant will read:{' '}
                  <strong className="font-medium">Required because {preview.explanation}.</strong>
                </span>
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Building use"
              htmlFor="buildingUse"
              hint="Empty means any. A further narrowing on top of the condition."
            >
              <Input value={buildingUse} onChange={(e) => setBuildingUse(e.target.value)} />
            </Field>

            <Field label="Land use" htmlFor="landUseZone" hint="Empty means any.">
              <Input value={landUseZone} onChange={(e) => setLandUseZone(e.target.value)} />
            </Field>
          </div>

          <Field
            label="Help text"
            htmlFor="helpText"
            hint="Shown under the document on the applicant's checklist."
          >
            <Textarea value={helpText} onChange={(e) => setHelpText(e.target.value)} rows={2} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display order" htmlFor="displayOrder">
              <Input
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </Field>

            <div className="space-y-3 pt-6">
              <label className="flex items-center gap-3 text-small">
                <Switch checked={isMandatory} onCheckedChange={setIsMandatory} />
                <span>
                  Mandatory
                  <span className="block text-caption text-text-muted">
                    A mandatory document blocks the fee until it is in.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 text-small">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span>Active</span>
              </label>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={save}
            // A rule the evaluator would choke on is never asked for, so it is
            // refused here rather than saved and silently ignored.
            disabled={saving || (preview !== null && !preview.valid)}
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
