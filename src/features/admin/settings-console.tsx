'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, RotateCcw, Lock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SettingRow } from '@/server/services/settings';

/**
 * Editing business configuration.
 *
 * ── The control is chosen by the setting's TYPE ──────────────────────────
 *
 * A BOOLEAN gets a switch, a NUMBER gets a numeric field, JSON gets a
 * monospaced textarea. Rendering everything as a text box would be less work
 * and would also be how `sla_warn_percent` ends up set to "seventy".
 *
 * ── Nothing is saved until Save is pressed ───────────────────────────────
 *
 * Every one of these values changes system behaviour immediately once stored —
 * a payment window, a notification channel, whether documents must be verified
 * before a fee can be raised. Auto-saving on blur would mean a mistyped digit
 * takes effect before the administrator has finished reading the row. So edits
 * are held locally, the group shows what has changed, and one press commits
 * the batch in a single transaction.
 */
export function SettingsConsole({
  groups,
}: {
  groups: Array<{ key: string; title: string; description: string; settings: SettingRow[] }>;
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <SettingsGroup key={group.key} group={group} />
      ))}
    </div>
  );
}

function SettingsGroup({
  group,
}: {
  group: { key: string; title: string; description: string; settings: SettingRow[] };
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const original = React.useMemo(
    () => Object.fromEntries(group.settings.map((s) => [s.key, s.value])),
    [group.settings]
  );

  const changed = Object.entries(draft).filter(([key, value]) => original[key] !== value);

  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const reset = () => setDraft({});

  const valueOf = (setting: SettingRow) => draft[setting.key] ?? setting.value;

  async function save() {
    if (!changed.length) return;
    setSaving(true);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changes: changed.map(([key, value]) => ({ key, value })) }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Field-level detail, when the server gave it — "sla_warn_percent takes
        // a number" is actionable; "Bad request" is not.
        const detail = Array.isArray(body?.details)
          ? body.details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join('\n')
          : (body?.error ?? 'The change could not be saved.');
        toast.error(detail);
        return;
      }

      toast.success(
        `${body.updated ?? changed.length} setting${(body.updated ?? changed.length) === 1 ? '' : 's'} updated.`
      );
      setDraft({});
      router.refresh();
    } catch {
      toast.error('The change could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{group.title}</CardTitle>
          {group.description && <CardDescription>{group.description}</CardDescription>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {changed.length > 0 && (
            <>
              <Badge tone="info">
                {changed.length} unsaved {changed.length === 1 ? 'change' : 'changes'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
                <RotateCcw className="size-4" />
                Discard
              </Button>
            </>
          )}
          <Button variant="primary" size="sm" onClick={save} disabled={saving || !changed.length}>
            <Save className="size-4" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="divide-y divide-border p-0">
        {group.settings.map((setting) => {
          const dirty = draft[setting.key] !== undefined && draft[setting.key] !== setting.value;

          return (
            <div
              key={setting.key}
              className={cn(
                'flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between',
                dirty && 'bg-info-bg/40'
              )}
            >
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`setting-${setting.key}`}
                  className="flex flex-wrap items-center gap-2 text-small font-medium text-text"
                >
                  {setting.label || setting.key}
                  {setting.isSecret && (
                    <span className="flex items-center gap-1 text-caption font-normal text-text-subtle">
                      <Lock className="size-3" />
                      secret
                    </span>
                  )}
                </label>
                <p className="font-mono text-caption text-text-subtle">{setting.key}</p>
                {setting.description && (
                  <p className="mt-1 max-w-[70ch] text-caption text-text-muted">{setting.description}</p>
                )}
              </div>

              <div className="w-full shrink-0 sm:w-[20rem]">
                <SettingControl
                  setting={setting}
                  value={valueOf(setting)}
                  onChange={(next) => set(setting.key, next)}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SettingControl({
  setting,
  value,
  onChange,
}: {
  setting: SettingRow;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `setting-${setting.key}`;

  if (setting.isSecret) {
    return (
      <div>
        <Input
          id={id}
          type="password"
          value={value}
          placeholder="[set]"
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        <p className="mt-1 text-caption text-text-subtle">
          Leave as it stands to keep the current value. The stored value is never sent to this page.
        </p>
      </div>
    );
  }

  switch (setting.type) {
    case 'BOOLEAN':
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={id}
            checked={value === 'true'}
            onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
          />
          <span className="text-small text-text-muted">{value === 'true' ? 'On' : 'Off'}</span>
        </div>
      );

    case 'NUMBER':
      return (
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="tabular-nums"
        />
      );

    case 'JSON':
      return (
        <div>
          <Textarea
            id={id}
            rows={4}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono text-caption"
            spellCheck={false}
          />
          <JsonHint value={value} />
        </div>
      );

    default:
      return <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Tells the administrator the JSON is broken before they press Save. */
function JsonHint({ value }: { value: string }) {
  let problem: string | null = null;
  try {
    JSON.parse(value);
  } catch (err) {
    problem = err instanceof Error ? err.message : 'Not valid JSON.';
  }

  if (!problem) return null;

  return (
    <p className="mt-1 flex items-start gap-1.5 text-caption text-danger">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
      {problem}
    </p>
  );
}
