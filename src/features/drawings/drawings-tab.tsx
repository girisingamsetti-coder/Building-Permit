'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  FilePlus2,
  History,
  Layers,
  Lock,
  Plus,
  ScanSearch,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { categoryLabel, formatBytes } from '@/lib/drawings';
import { api, ApiCallError } from '@/features/applications/api';
import { UploadPanel } from './upload-panel';
import type { DrawingsPayload, DrawingRow, DrawingVersionRow } from './types';

/**
 * The Drawings tab.
 *
 * ── What the version table is for ──────────────────────────────────────
 *
 * It is the evidence that the correction loop happened. V1 failed, V2 failed,
 * V3 passed — each with who uploaded it, when, and what the engine said. That
 * history is why drawings are versioned rather than replaced, so the table
 * shows every version rather than only the current one, and superseded rows
 * stay downloadable: a report that judged V1 is meaningless if V1 is gone.
 */
export function DrawingsTab({
  initial,
  canUpload,
  canRequestScrutiny,
}: {
  initial: DrawingsPayload;
  /** Capability, from the server. The status gate is inside `initial`. */
  canUpload: boolean;
  canRequestScrutiny: boolean;
}) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [adding, setAdding] = React.useState(false);
  const [versioning, setVersioning] = React.useState<DrawingRow | null>(null);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => setData(initial), [initial]);

  const refresh = React.useCallback(async () => {
    try {
      const next = await api.get<DrawingsPayload>(
        `/api/applications/${initial.application.id}/drawings`
      );
      setData(next);
    } catch {
      // A failed refresh leaves the last good data on screen rather than
      // blanking the table; the router refresh below re-renders from the
      // server anyway.
    }
    router.refresh();
  }, [initial.application.id, router]);

  const totalVersions = data.drawings.reduce((n, d) => n + d.versions.length, 0);
  const uploadAllowed = canUpload && data.canUpload;

  async function runScrutiny() {
    setRunning(true);
    try {
      const res = await api.post<{ requested: number; engineDriver: string; skipped?: boolean }>(
        `/api/applications/${initial.application.id}/scrutiny`
      );
      toast.success(
        res.skipped ? 'Drawing accepted' : 'Scrutiny started',
        {
          description: res.skipped
            ? 'This application type is not machine-checked. It moves on to documents.'
            : `${res.requested} drawing${res.requested === 1 ? '' : 's'} sent to the ${res.engineDriver} engine.`,
        }
      );
      await refresh();
    } catch (error) {
      toast.error('Could not start scrutiny', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── The gate, stated plainly ───────────────────────────────────── */}
      {!uploadAllowed && data.uploadBlockedReason && (
        <div className="flex items-start gap-2 rounded border border-border bg-surface-sunk px-3 py-2.5">
          <Lock className="mt-0.5 size-4 shrink-0 text-text-subtle" />
          <p className="text-small text-text-muted">{data.uploadBlockedReason}</p>
        </div>
      )}

      {/* ── Upload ─────────────────────────────────────────────────────── */}
      {uploadAllowed && (adding || data.drawings.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle>{data.drawings.length === 0 ? 'Upload your drawing' : 'Add a sheet'}</CardTitle>
            <CardDescription>
              Each sheet is versioned. Uploading a correction never replaces what came before.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UploadPanel
              applicationId={data.application.id}
              categories={data.categories}
              maxUploadBytes={data.maxUploadBytes}
              onUploaded={() => {
                setAdding(false);
                void refresh();
              }}
              onCancel={data.drawings.length ? () => setAdding(false) : undefined}
            />
          </CardContent>
        </Card>
      )}

      {/* ── New version of an existing sheet ───────────────────────────── */}
      {versioning && (
        <Card>
          <CardHeader>
            <CardTitle>New version of {versioning.title}</CardTitle>
            <CardDescription>
              This becomes V{versioning.currentVersionNo + 1}. V{versioning.currentVersionNo} is kept
              and marked superseded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UploadPanel
              applicationId={data.application.id}
              categories={data.categories}
              maxUploadBytes={data.maxUploadBytes}
              drawingId={versioning.id}
              defaultCategory={versioning.category}
              defaultTitle={versioning.title}
              onUploaded={() => {
                setVersioning(null);
                void refresh();
              }}
              onCancel={() => setVersioning(null)}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Actions ────────────────────────────────────────────────────── */}
      {data.drawings.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-text-muted">
            {data.drawings.length} sheet{data.drawings.length === 1 ? '' : 's'} ·{' '}
            {totalVersions} version{totalVersions === 1 ? '' : 's'}
          </p>

          <div className="flex flex-wrap gap-2">
            {uploadAllowed && !adding && (
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <Plus className="size-4" />
                Add a sheet
              </Button>
            )}

            {canRequestScrutiny && (
              <RunScrutinyButton
                allowed={data.application.requiresScrutiny ? true : true}
                busy={running}
                onRun={runScrutiny}
                requiresScrutiny={data.application.requiresScrutiny}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Sheets ─────────────────────────────────────────────────────── */}
      {data.drawings.length === 0 && !uploadAllowed ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Layers}
              title="No drawings were uploaded"
              description="Nothing has been submitted against this application."
            />
          </CardContent>
        </Card>
      ) : (
        data.drawings.map((drawing) => (
          <SheetCard
            key={drawing.id}
            drawing={drawing}
            categories={data.categories}
            canUpload={uploadAllowed}
            onNewVersion={() => setVersioning(drawing)}
          />
        ))
      )}
    </div>
  );
}

function RunScrutinyButton({
  busy,
  onRun,
  requiresScrutiny,
}: {
  allowed: boolean;
  busy: boolean;
  onRun: () => void;
  requiresScrutiny: boolean;
}) {
  return (
    <Button variant="primary" onClick={onRun} loading={busy}>
      <ScanSearch className="size-4" />
      {requiresScrutiny ? 'Run scrutiny' : 'Submit drawing'}
    </Button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// One sheet, with its full version history
// ═══════════════════════════════════════════════════════════════════════════

function SheetCard({
  drawing,
  categories,
  canUpload,
  onNewVersion,
}: {
  drawing: DrawingRow;
  categories: Array<{ code: string; label: string }>;
  canUpload: boolean;
  onNewVersion: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {drawing.title}
            <Badge tone="outline">{categoryLabel(drawing.category, categories)}</Badge>
          </CardTitle>
          <CardDescription>
            {drawing.versions.length} version{drawing.versions.length === 1 ? '' : 's'} · current is
            V{drawing.currentVersionNo}
          </CardDescription>
        </div>

        {canUpload && (
          <Button size="sm" variant="secondary" onClick={onNewVersion}>
            <FilePlus2 className="size-4" />
            New version
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Version</TableHead>
              <TableHead>Uploaded by</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scrutiny result</TableHead>
              <TableHead className="text-right">File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drawing.versions.map((version) => (
              <VersionRow key={version.id} version={version} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function VersionRow({ version }: { version: DrawingVersionRow }) {
  const scrutiny = version.latestScrutiny;

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium tabular-nums text-text">V{version.versionNo}</span>
        {version.remarks && (
          <p className="mt-0.5 max-w-[28ch] truncate text-caption text-text-muted" title={version.remarks}>
            {version.remarks}
          </p>
        )}
      </TableCell>

      <TableCell className="text-small text-text-muted">{version.uploadedByName}</TableCell>

      <TableCell>
        <span
          className="whitespace-nowrap text-small text-text-muted"
          title={new Date(version.uploadedAt).toLocaleString('en-IN')}
        >
          {new Date(version.uploadedAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      </TableCell>

      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          {version.isActive ? (
            <Badge tone="success">Current</Badge>
          ) : (
            <Badge tone="neutral">Superseded</Badge>
          )}
          {/* The scan state is shown, not hidden: "Not scanned" is an honest
              label for a deployment with no antivirus configured. */}
          <StatusBadge kind="scan" status={version.file.scanStatus} />
        </div>
      </TableCell>

      <TableCell>
        {!scrutiny ? (
          <span className="text-small text-text-subtle">Not checked</span>
        ) : scrutiny.status === 'COMPLETED' && scrutiny.result ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge kind="outcome" status={scrutiny.result.outcome} />
            <span className="whitespace-nowrap text-caption tabular-nums text-text-muted">
              {scrutiny.result.checksPassed}/{scrutiny.result.checksRun}
            </span>
          </div>
        ) : scrutiny.status === 'ERRORED' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">
                <StatusBadge kind="scrutiny" status="ERRORED" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {scrutiny.errorMessage ||
                'The engine could not be reached. Your drawing has not been rejected.'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <StatusBadge kind="scrutiny" status={scrutiny.status} />
        )}
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="whitespace-nowrap text-caption text-text-subtle">
            {formatBytes(version.file.sizeBytes)}
          </span>
          {version.downloadable ? (
            <Button asChild size="sm" variant="ghost">
              <a href={`/api/drawings/versions/${version.id}/download`}>
                <Download className="size-4" />
                <span className="sr-only">Download V{version.versionNo}</span>
              </a>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button size="sm" variant="ghost" disabled>
                    <ShieldCheck className="size-4" />
                    <span className="sr-only">Download unavailable</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                This file has not cleared the virus check yet, so it cannot be downloaded.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export { History };
