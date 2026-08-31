'use client';

import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';

/**
 * The audit trail for one application.
 *
 * ── Not the timeline, and the difference is the point ────────────────────
 *
 * The timeline answers "what happened to my application" in the applicant's
 * language. This answers "which fields changed, from what to what, under whose
 * account" — the question that only gets asked when something is disputed, and
 * the one a summary cannot answer.
 *
 * Every row shows its BEFORE and AFTER as stored. They are rendered as data
 * rather than prose on purpose: the moment this screen starts paraphrasing, it
 * stops being evidence.
 */

export type AuditRow = {
  id: string;
  seq: string | number;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorRoleKey: string;
  before: unknown;
  after: unknown;
  remarks: string;
  ip: string;
  correlationId: string;
  occurredAt: string;
};

export function AuditPanel({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nothing recorded against this application yet"
        description="Every change to this file is written here as it happens, with the value before and after."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" aria-hidden />
          Audit trail
        </CardTitle>
        <CardDescription>
          Every change to this application, newest first, with the value before and after. The rows
          are hash-chained and the database refuses an update or a delete on this table — for the
          application&rsquo;s own role as well as anyone else&rsquo;s.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        {rows.map((row) => (
          <details key={row.id} className="rounded border border-border">
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0">
                <span className="font-medium text-text">{humanise(row.action)}</span>
                <span className="ml-2 text-caption text-text-muted">
                  {row.actorName}
                  {row.actorRoleKey ? ` · ${row.actorRoleKey.replace(/_/g, ' ')}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge tone="outline">{row.entityType}</Badge>
                <time className="text-caption tabular-nums text-text-muted" dateTime={row.occurredAt}>
                  {new Date(row.occurredAt).toLocaleString()}
                </time>
              </span>
            </summary>

            <div className="space-y-2 border-t border-border px-3 py-2">
              {row.remarks && <p className="text-small text-text">{row.remarks}</p>}

              <div className="grid gap-2 sm:grid-cols-2">
                <Snapshot label="Before" value={row.before} />
                <Snapshot label="After" value={row.after} />
              </div>

              <p className="text-caption text-text-subtle">
                #{String(row.seq)}
                {row.ip ? ` · ${row.ip}` : ''}
                {row.correlationId ? ` · ${row.correlationId}` : ''}
              </p>
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

function Snapshot({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div>
        <p className="text-caption text-text-muted">{label}</p>
        <p className="text-small text-text-subtle">—</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <p className="text-caption text-text-muted">{label}</p>
      <pre className="overflow-x-auto rounded bg-surface-sunk p-2 text-caption text-text">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

const humanise = (action: string): string => {
  const words = action.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
