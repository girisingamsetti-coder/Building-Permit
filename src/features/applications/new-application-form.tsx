'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, FileText, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { api, ApiCallError } from './api';
import type { ApplicationDetail, ApplicationMeta } from './types';

/**
 * Choosing what to file.
 *
 * The type is asked FIRST and cannot be changed afterwards, because it decides
 * three things at once: the number series the application is registered under,
 * whether it goes through scrutiny, and which fee schedule and document
 * requirements apply. Letting it change mid-wizard would mean re-issuing a
 * number from a gap-free register, which is not a thing that can be undone
 * tidily.
 *
 * Cards rather than a dropdown: there are three or four of these, each with a
 * consequence worth reading, and a select box hides all of it behind a click.
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  RESIDENTIAL_BUILDING: Building2,
  COMMERCIAL_BUILDING: Building2,
  LAYOUT_APPROVAL: Map,
};

export function NewApplicationForm({ meta }: { meta: ApplicationMeta }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string>(meta.types[0]?.id ?? '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function start() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const application = await api.post<ApplicationDetail>('/api/applications', {
        applicationTypeId: selected,
      });

      toast.success('Application started', {
        description: `Registered as ${application.applicationNumber}.`,
      });

      router.push(`/applications/${application.id}/edit`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiCallError ? err.message : 'Could not start the application. Try again.'
      );
      setBusy(false);
    }
  }

  if (!meta.types.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-body font-medium text-text">No application types are available</p>
          <p className="mx-auto mt-1 max-w-[48ch] text-small text-text-muted">
            An administrator configures which permissions can be applied for. Ask them to activate
            at least one application type.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded border border-danger/30 bg-danger-bg px-3 py-2 text-small text-danger">
          {error}
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="sr-only">Choose an application type</legend>

        <div className="grid gap-3 sm:grid-cols-2">
          {meta.types.map((type) => {
            const Icon = ICONS[type.code] ?? FileText;
            const active = selected === type.id;

            return (
              <label
                key={type.id}
                className={cn(
                  'relative flex cursor-pointer gap-3 rounded border p-4 transition-colors',
                  'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1 focus-within:ring-offset-bg',
                  active
                    ? 'border-primary bg-primary-subtle'
                    : 'border-border bg-surface hover:border-border-strong hover:bg-surface-sunk'
                )}
              >
                <input
                  type="radio"
                  name="applicationTypeId"
                  value={type.id}
                  checked={active}
                  onChange={() => setSelected(type.id)}
                  className="sr-only"
                />

                <Icon className={cn('mt-0.5 size-5 shrink-0', active ? 'text-primary' : 'text-text-muted')} />

                <div className="min-w-0 space-y-1">
                  <p className={cn('text-small font-medium', active ? 'text-primary' : 'text-text')}>
                    {type.name}
                  </p>
                  <p className="text-caption text-text-muted">{type.description}</p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Badge tone="outline">Numbered {type.numberPrefix}/…</Badge>
                    {type.requiresScrutiny && <Badge tone="info">Drawing scrutiny required</Badge>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded border border-border bg-surface-sunk px-3 py-2.5">
        <p className="text-caption text-text-muted">
          An application number is issued as soon as you begin, and the file is saved as a draft.
          You can leave at any point and pick up where you left off — nothing is filed until you
          submit it.
        </p>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={start} loading={busy} disabled={!selected}>
          Start application
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
