'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ScanSearch,
  Download,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Loader2,
  Lightbulb,
  Info,
  RotateCw,
  FlaskConical,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { isBlocking } from '@/lib/drawings';
import { api, ApiCallError } from '@/features/applications/api';
import type { ScrutinyPayload, ScrutinyRunRow, ScrutinyIssueRow } from '@/features/drawings/types';

/**
 * The Scrutiny tab.
 *
 * ── The hierarchy this screen commits to ───────────────────────────────
 *
 *   1. Did it pass?          — one banner, unmissable
 *   2. How much passed?      — the check tally
 *   3. What must I fix?      — blocking issues, worst first
 *   4. What should I know?   — advisories, which do not block
 *   5. How do I fix it?      — a remedy on every finding
 *   6. Proof                 — the downloadable report
 *
 * An LTP reading this is trying to answer exactly one question — "what do I
 * change?" — so the remedy sits inside each finding rather than in a separate
 * list they would have to cross-reference.
 *
 * ── Polling ────────────────────────────────────────────────────────────
 *
 * A run is asynchronous by design (the mock simulates engine latency), so this
 * polls while anything is QUEUED or RUNNING and stops the moment everything
 * settles. No websocket for a job that finishes in seconds.
 */
export function ScrutinyTab({
  initial,
  canRequest,
}: {
  initial: ScrutinyPayload;
  /** Capability, from the server. The status gate is inside `initial`. */
  canRequest: boolean;
}) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => setData(initial), [initial]);

  const inFlight = data.current.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING');

  const refresh = React.useCallback(async () => {
    try {
      setData(await api.get<ScrutinyPayload>(`/api/applications/${initial.application.id}/scrutiny`));
    } catch {
      /* Keep the last good view; the next tick tries again. */
    }
  }, [initial.application.id]);

  // Poll only while something is actually running.
  React.useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [inFlight, refresh]);

  // When the run settles, re-render the page so the header status and the
  // other tabs catch up too.
  const wasInFlight = React.useRef(inFlight);
  React.useEffect(() => {
    if (wasInFlight.current && !inFlight) router.refresh();
    wasInFlight.current = inFlight;
  }, [inFlight, router]);

  async function run() {
    setRunning(true);
    try {
      const res = await api.post<{ requested: number; engineDriver: string; skipped?: boolean }>(
        `/api/applications/${initial.application.id}/scrutiny`
      );
      toast.success(res.skipped ? 'Drawing accepted' : 'Scrutiny started', {
        description: res.skipped
          ? 'This application type is not machine-checked.'
          : `Sent to the ${res.engineDriver} engine.`,
      });
      await refresh();
      router.refresh();
    } catch (error) {
      toast.error('Could not start scrutiny', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
    } finally {
      setRunning(false);
    }
  }

  const requestAllowed = canRequest && data.canRequest;

  if (!data.application.requiresScrutiny) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Info}
            title="This application type is not machine-checked"
            description="Its drawings are reviewed by an officer instead of an automated engine. Nothing is required from you here."
          />
        </CardContent>
      </Card>
    );
  }

  if (data.history.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={ScanSearch}
            title="Scrutiny has not been run yet"
            description={
              requestAllowed
                ? 'Upload your drawings, then run scrutiny to have them checked against the particulars you filed.'
                : (data.requestBlockedReason ??
                  'Scrutiny runs once the drawings have been submitted.')
            }
            action={
              requestAllowed ? (
                <Button variant="primary" onClick={run} loading={running}>
                  <ScanSearch className="size-4" />
                  Run scrutiny
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {inFlight ? (
        <RunningBanner runs={data.current} />
      ) : (
        <OutcomeBanner
          runs={data.current}
          onRerun={requestAllowed ? run : undefined}
          rerunning={running}
          blockedReason={data.requestBlockedReason}
        />
      )}

      {!inFlight && data.current.length > 0 && <ChecksSummary totals={data.totals} />}

      {data.current.map((run_) => (
        <RunCard key={run_.id} run={run_} />
      ))}

      {data.history.length > data.current.length && (
        <PreviousRuns runs={data.history.filter((r) => !data.current.some((c) => c.id === r.id))} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Did it pass?
// ═══════════════════════════════════════════════════════════════════════════

function RunningBanner({ runs }: { runs: ScrutinyRunRow[] }) {
  return (
    <div className="flex items-start gap-3 rounded border border-info/25 bg-info-bg px-4 py-3">
      <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-info" aria-hidden />
      <div className="min-w-0">
        <p className="text-small font-medium text-info" aria-live="polite">
          Scrutiny is running
        </p>
        <p className="mt-0.5 text-caption text-info">
          {runs.length} drawing{runs.length === 1 ? '' : 's'} being checked. This page updates on its
          own — you can leave and come back.
        </p>
      </div>
    </div>
  );
}

function OutcomeBanner({
  runs,
  onRerun,
  rerunning,
  blockedReason,
}: {
  runs: ScrutinyRunRow[];
  onRerun?: () => void;
  rerunning: boolean;
  blockedReason: string | null;
}) {
  const errored = runs.filter((r) => r.status === 'ERRORED');
  const failed = runs.filter((r) => r.result?.outcome === 'FAIL');
  const passed = runs.length > 0 && runs.every((r) => r.result?.outcome === 'PASS');

  // An engine error is NOT a verdict on the drawing, and the wording has to
  // make that unmistakable — otherwise an applicant redraws a correct sheet.
  if (errored.length) {
    return (
      <div className="rounded border border-danger/30 bg-danger-bg px-4 py-3">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold text-danger">Scrutiny could not be completed</p>
            <p className="mt-1 text-caption text-danger">
              The engine could not be reached. <strong>Your drawing has not been rejected</strong> —
              nothing was judged. Run scrutiny again.
            </p>
            {errored[0]?.errorMessage && (
              <p className="mt-1 font-mono text-caption text-danger/80">{errored[0].errorMessage}</p>
            )}
          </div>
          {onRerun && (
            <Button size="sm" variant="secondary" onClick={onRerun} loading={rerunning}>
              <RotateCw className="size-4" />
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (passed) {
    return (
      <div className="rounded border border-success/30 bg-success-bg px-4 py-3">
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div className="min-w-0">
            <p className="text-small font-semibold text-success">Scrutiny passed</p>
            <p className="mt-1 text-caption text-success">
              Your drawings satisfied every blocking check. Document submission is now open.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-danger/30 bg-danger-bg px-4 py-3">
      <div className="flex items-start gap-3">
        <CircleX className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-small font-semibold text-danger">
            Scrutiny failed on {failed.length} drawing{failed.length === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-caption text-danger">
            Correct the issues below and upload a new version. Your application stays open — nothing
            has been rejected, and you do not start again.
          </p>
        </div>
        {onRerun && (
          <Button size="sm" variant="secondary" onClick={onRerun} loading={rerunning}>
            <RotateCw className="size-4" />
            Re-run
          </Button>
        )}
      </div>
      {!onRerun && blockedReason && (
        <p className="mt-2 pl-8 text-caption text-danger/80">{blockedReason}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. How much passed?
// ═══════════════════════════════════════════════════════════════════════════

function ChecksSummary({ totals }: { totals: ScrutinyPayload['totals'] }) {
  const failed = totals.checksRun - totals.checksPassed;

  const tiles = [
    { label: 'Checks run', value: totals.checksRun, tone: '' },
    { label: 'Passed', value: totals.checksPassed, tone: 'text-success' },
    { label: 'Failed', value: failed, tone: failed ? 'text-danger' : '' },
    { label: 'Critical', value: totals.critical, tone: totals.critical ? 'text-danger' : '' },
    { label: 'Major', value: totals.major, tone: totals.major ? 'text-danger' : '' },
    { label: 'Minor', value: totals.minor, tone: totals.minor ? 'text-warning' : '' },
    { label: 'Advisory', value: totals.info, tone: totals.info ? 'text-info' : '' },
  ];

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <p className="text-caption uppercase tracking-wide text-text-muted">{tile.label}</p>
            <p className={cn('mt-0.5 text-h1 tabular-nums text-text', tile.tone)}>{tile.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3–6. One run: findings, remedies, report
// ═══════════════════════════════════════════════════════════════════════════

function RunCard({ run }: { run: ScrutinyRunRow }) {
  const result = run.result;
  const blocking = result?.issues.filter((i) => isBlocking(i.severity)) ?? [];
  const advisory = result?.issues.filter((i) => !isBlocking(i.severity)) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {run.drawingVersion.drawing.title}
            <Badge tone="outline">V{run.drawingVersion.versionNo}</Badge>
            {result && <StatusBadge kind="outcome" status={result.outcome} />}
          </CardTitle>
          <CardDescription>
            {result?.summary ??
              (run.status === 'ERRORED' ? run.errorMessage : 'Waiting for the engine…')}
          </CardDescription>
        </div>

        {result?.report && (
          <Button asChild size="sm" variant="secondary">
            <a href={`/api/scrutiny/results/${result.id}/report`}>
              <Download className="size-4" />
              Report
            </a>
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Provenance. A mock result must never be mistaken for a decision. */}
        {result?.report?.isDemo && (
          <div className="flex items-start gap-2 rounded border border-warning/30 bg-warning-bg px-3 py-2">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-caption text-warning">
              <strong>Demonstration result.</strong> This was produced by the{' '}
              <span className="font-mono">{run.engineDriver}</span> engine, which does not read the
              drawing and does not assess compliance with any building rule. It carries no statutory
              weight.
            </p>
          </div>
        )}

        {result && result.issues.length === 0 && (
          <div className="flex items-start gap-2 rounded border border-success/25 bg-success-bg px-3 py-2.5">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <p className="text-small text-success">
              All {result.checksRun} checks were satisfied. Nothing to correct.
            </p>
          </div>
        )}

        {blocking.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-small font-semibold text-text">
              <CircleX className="size-4 text-danger" aria-hidden />
              Must be corrected ({blocking.length})
            </h3>
            <div className="space-y-2">
              {blocking.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          </section>
        )}

        {advisory.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-small font-semibold text-text">
              <Info className="size-4 text-info" aria-hidden />
              Advisory ({advisory.length})
            </h3>
            <p className="mb-2 text-caption text-text-muted">
              These do not block your application. Addressing them may save a query later.
            </p>
            <div className="space-y-2">
              {advisory.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function IssueCard({ issue }: { issue: ScrutinyIssueRow }) {
  const blocking = isBlocking(issue.severity);

  return (
    <div
      className={cn(
        'rounded border border-l-4 border-border bg-surface p-3',
        blocking ? 'border-l-danger' : issue.severity === 'MINOR' ? 'border-l-warning' : 'border-l-info'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="severity" status={issue.severity} />
        <span className="text-small font-medium text-text">{issue.title}</span>
        <span className="font-mono text-caption text-text-subtle">{issue.ruleCode}</span>
        {issue.rule?.category && <Badge tone="outline">{issue.rule.category}</Badge>}
      </div>

      <p className="mt-1.5 text-small text-text-muted">{issue.description}</p>

      {(issue.expectedValue || issue.actualValue) && (
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-caption sm:grid-cols-[auto_1fr]">
          {issue.expectedValue && (
            <>
              <dt className="text-text-muted">Expected</dt>
              <dd className="text-text">{issue.expectedValue}</dd>
            </>
          )}
          {issue.actualValue && (
            <>
              <dt className="text-text-muted">Found</dt>
              <dd className="text-text">{issue.actualValue}</dd>
            </>
          )}
          {issue.layer && (
            <>
              <dt className="text-text-muted">Layer</dt>
              <dd className="font-mono text-text">{issue.layer}</dd>
            </>
          )}
        </dl>
      )}

      {/* The recommendation lives WITH the finding. An LTP reading this is
          asking "what do I change?", and making them cross-reference a
          separate list to answer it is a design that costs a revision. */}
      {issue.rule?.remedy && (
        <div className="mt-2 flex items-start gap-2 rounded bg-surface-sunk px-2.5 py-2">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden />
          <p className="text-caption text-text">
            <span className="font-medium">What to do: </span>
            {issue.rule.remedy}
          </p>
        </div>
      )}

      {/* No citation is shown when there is none. An invented clause number
          would be worse than an absent one. */}
      {issue.rule?.reference && (
        <p className="mt-1.5 text-caption text-text-subtle">Reference: {issue.rule.reference}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The correction history
// ═══════════════════════════════════════════════════════════════════════════

function PreviousRuns({ runs }: { runs: ScrutinyRunRow[] }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Earlier runs</CardTitle>
        <CardDescription>
          Every check ever run on this application, including superseded drawing versions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {(open ? runs : runs.slice(0, 3)).map((run) => (
          <div
            key={run.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-small text-text">
                {run.drawingVersion.drawing.title}{' '}
                <span className="text-text-muted">V{run.drawingVersion.versionNo}</span>
                {run.attempt > 1 && (
                  <span className="text-text-subtle"> · attempt {run.attempt}</span>
                )}
              </p>
              <p className="text-caption text-text-subtle">
                {new Date(run.requestedAt).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {run.result && ` · ${run.result.checksPassed}/${run.result.checksRun} checks passed`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {run.result ? (
                <StatusBadge kind="outcome" status={run.result.outcome} />
              ) : (
                <StatusBadge kind="scrutiny" status={run.status} />
              )}
              {run.result?.report && (
                <Button asChild size="sm" variant="ghost">
                  <a href={`/api/scrutiny/results/${run.result.id}/report`}>
                    <Download className="size-4" />
                    <span className="sr-only">Report for V{run.drawingVersion.versionNo}</span>
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}

        {runs.length > 3 && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded text-caption font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Show {runs.length - 3} more
          </button>
        )}
      </CardContent>
    </Card>
  );
}
