'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  CircleCheck,
  Clock,
  Download,
  Eye,
  FileText,
  History,
  Lock,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/common/status-badge';
import { toast } from '@/components/ui/toast';
import { formatBytes } from '@/lib/documents';
import { cn } from '@/lib/utils';
import { api, ApiCallError } from '@/features/applications/api';
import { DocumentUpload } from './document-upload';
import type { ChecklistEntry, DocumentVersionRow, DocumentsPayload } from './types';

/**
 * The Documents tab — the checklist.
 *
 * ── What this screen is for ────────────────────────────────────────────
 *
 * One question: WHAT IS STILL MISSING? Everything else on the page is
 * subordinate to answering it at a glance. So the tick or cross comes first in
 * the row, outstanding documents sort to the top, and the completion banner
 * states the count rather than a colour.
 *
 * The list is DERIVED on the server from the requirement rules, never stored,
 * so a building that gains a floor starts requiring a structural certificate
 * immediately. A conditionally-required document says WHY it is being asked
 * for — an unexplained extra row is what generates a telephone call to the
 * office.
 *
 * Every version ever uploaded stays on the row, including rejected ones with
 * the remark that rejected them. That history is the evidence that the
 * correction cycle happened, and it is the reason documents are versioned
 * rather than replaced.
 */
export function DocumentsTab({
  initial,
  canUpload,
  canVerify,
}: {
  initial: DocumentsPayload;
  /** Capability, from the server. The status gate is inside `initial`. */
  canUpload: boolean;
  canVerify: boolean;
}) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [uploading, setUploading] = React.useState<ChecklistEntry | null>(null);
  const [verifying, setVerifying] = React.useState<ChecklistEntry | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  React.useEffect(() => setData(initial), [initial]);

  const refresh = React.useCallback(async () => {
    try {
      const next = await api.get<DocumentsPayload>(
        `/api/applications/${initial.application.id}/documents`
      );
      setData(next);
    } catch {
      // A failed refresh leaves the last good data on screen rather than
      // blanking the checklist; the router refresh re-renders from the server.
    }
    router.refresh();
  }, [initial.application.id, router]);

  const uploadAllowed = canUpload && data.canUpload;

  // Outstanding first, then rejected, then the rest — the order in which
  // somebody working through the list needs them.
  const entries = React.useMemo(() => sortForWork(data.entries), [data.entries]);

  const required = entries.filter((e) => e.isRequired && e.isMandatory);
  const optional = entries.filter((e) => e.isRequired && !e.isMandatory);
  const extra = entries.filter((e) => !e.isRequired);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <CompletionBanner data={data} />

        {!uploadAllowed && data.uploadBlockedReason && (
          <div className="flex items-start gap-2 rounded border border-border bg-surface-sunk px-3 py-2.5">
            <Lock className="mt-0.5 size-4 shrink-0 text-text-subtle" />
            <p className="text-small text-text-muted">{data.uploadBlockedReason}</p>
          </div>
        )}

        <ChecklistCard
          title="Required documents"
          description={
            data.requiresVerification
              ? 'Each of these must be uploaded and verified before the fee can be generated.'
              : 'Each of these must be uploaded before the fee can be generated.'
          }
          entries={required}
          empty="This application type requires no supporting documents."
          {...{ data, uploadAllowed, canVerify, expanded, setExpanded, setUploading, setVerifying }}
        />

        {optional.length > 0 && (
          <ChecklistCard
            title="Optional documents"
            description="Attach these if you have them. They never hold up a fee."
            entries={optional}
            empty=""
            {...{ data, uploadAllowed, canVerify, expanded, setExpanded, setUploading, setVerifying }}
          />
        )}

        {extra.length > 0 && (
          <ChecklistCard
            title="Also uploaded"
            description="No longer required for this application, and kept on the record."
            entries={extra}
            empty=""
            {...{ data, uploadAllowed, canVerify, expanded, setExpanded, setUploading, setVerifying }}
          />
        )}

        {/* ── Upload ─────────────────────────────────────────────────────── */}
        <Dialog open={uploading !== null} onOpenChange={(open) => !open && setUploading(null)}>
          <DialogContent className="sm:max-w-xl">
            {uploading && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {uploading.currentVersionNo > 0 ? 'Replace' : 'Upload'} {uploading.name}
                  </DialogTitle>
                  <DialogDescription>
                    {uploading.currentVersionNo > 0
                      ? `This becomes version ${uploading.currentVersionNo + 1}. Version ${uploading.currentVersionNo} is kept and marked superseded.`
                      : uploading.description}
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <DocumentUpload
                    applicationId={data.application.id}
                    entry={uploading}
                    onUploaded={() => {
                      setUploading(null);
                      void refresh();
                    }}
                    onCancel={() => setUploading(null)}
                  />
                </DialogBody>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Verify ─────────────────────────────────────────────────────── */}
        <VerifyDialog
          entry={verifying}
          onClose={() => setVerifying(null)}
          onDone={() => {
            setVerifying(null);
            void refresh();
          }}
        />
      </div>

      <div className="space-y-4">
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader>
            <CardTitle>Required List</CardTitle>
            <CardDescription>Documents needed for this application.</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const originalRequired = data.entries.filter((e) => e.isRequired && e.isMandatory);
              return originalRequired.length > 0 ? (
                <ul className="space-y-3">
                  {originalRequired.map((doc) => (
                    <li key={doc.documentTypeId} className="flex items-start gap-2 text-small">
                      {doc.satisfied ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      ) : (
                        <div className="mt-1 size-3 shrink-0 rounded-full border border-danger bg-danger/10" />
                      )}
                      <span className={cn(doc.satisfied ? "text-success font-medium" : "text-danger font-medium")}>
                        {doc.name}
                        {!doc.satisfied && <span className="ml-1 text-danger font-normal">(Pending)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-text-muted">No documents required.</p>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Completion
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The answer to "can I pay yet?", stated before anything else on the page.
 *
 * When something is missing it NAMES what is missing, in full. A count alone
 * ("3 outstanding") makes the applicant scroll and count, and a count that
 * disagrees with what they think they uploaded is where support calls start.
 */
function CompletionBanner({ data }: { data: DocumentsPayload }) {
  const { summary, missing } = data;

  if (summary.complete) {
    return (
      <div className="flex items-start gap-2.5 rounded border border-success/25 bg-success-bg px-4 py-3">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <div>
          <p className="text-body font-medium text-success">Every required document is in</p>
          <p className="mt-0.5 text-small text-text-muted">
            {summary.required === 0
              ? 'This application type requires no supporting documents.'
              : `${summary.required} required document${summary.required === 1 ? '' : 's'} accounted for.`}{' '}
            The fee can now be generated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-warning/30 bg-warning-bg px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="text-body font-medium text-warning">
            {missing.length} of {summary.required} required document
            {summary.required === 1 ? '' : 's'} outstanding
          </p>
          <p className="mt-0.5 text-small text-text-muted">
            The fee cannot be generated until each of these is in.
          </p>
          <ul className="mt-2 space-y-1">
            {missing.map((item) => (
              <li key={item.code} className="flex items-start gap-2 text-small text-text">
                <X className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                <span>
                  <span className="font-medium">{item.name}</span>
                  <span className="text-text-muted"> — {item.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The checklist
// ═══════════════════════════════════════════════════════════════════════════

type CardProps = {
  title: string;
  description: string;
  entries: ChecklistEntry[];
  empty: string;
  data: DocumentsPayload;
  uploadAllowed: boolean;
  canVerify: boolean;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  setUploading: (entry: ChecklistEntry | null) => void;
  setVerifying: (entry: ChecklistEntry | null) => void;
};

function ChecklistCard({
  title,
  description,
  entries,
  empty,
  uploadAllowed,
  canVerify,
  expanded,
  setExpanded,
  setUploading,
  setVerifying,
}: CardProps) {
  if (!entries.length && !empty) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <p className="px-4 pb-4 text-small text-text-muted">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <span className="sr-only">Complete</span>
                </TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Latest version</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <React.Fragment key={entry.documentTypeId}>
                  <EntryRow
                    entry={entry}
                    uploadAllowed={uploadAllowed}
                    canVerify={canVerify}
                    expanded={expanded.has(entry.documentTypeId)}
                    onToggle={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(entry.documentTypeId)) next.delete(entry.documentTypeId);
                        else next.add(entry.documentTypeId);
                        return next;
                      })
                    }
                    onUpload={() => setUploading(entry)}
                    onVerify={() => setVerifying(entry)}
                  />
                  {expanded.has(entry.documentTypeId) && entry.versions.length > 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="bg-surface-sunk p-0">
                        <VersionHistory entry={entry} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EntryRow({
  entry,
  uploadAllowed,
  canVerify,
  expanded,
  onToggle,
  onUpload,
  onVerify,
}: {
  entry: ChecklistEntry;
  uploadAllowed: boolean;
  canVerify: boolean;
  expanded: boolean;
  onToggle: () => void;
  onUpload: () => void;
  onVerify: () => void;
}) {
  const active = entry.versions.find((v) => v.isActive) ?? null;

  return (
    <TableRow>
      {/* The tick or cross, first, so a column of them reads as a checklist
          rather than as a table that happens to contain one. Both carry an
          accessible name: colour and glyph are never the only signal. */}
      <TableCell>
        {entry.satisfied ? (
          <span
            className="inline-flex size-6 items-center justify-center rounded-full bg-success-bg text-success"
            role="img"
            aria-label="Complete"
          >
            <Check className="size-4" aria-hidden />
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full',
              entry.isMandatory && entry.isRequired
                ? 'bg-danger-bg text-danger'
                : 'bg-neutral-bg text-text-subtle'
            )}
            role="img"
            aria-label={entry.isMandatory && entry.isRequired ? 'Outstanding' : 'Not uploaded'}
          >
            <X className="size-4" aria-hidden />
          </span>
        )}
      </TableCell>

      <TableCell>
        <div className="min-w-0">
          <p className="text-small font-medium text-text">
            {entry.name}
            {entry.isRequired && !entry.isMandatory && (
              <span className="ml-2 text-caption font-normal text-text-subtle">Optional</span>
            )}
          </p>
          {entry.helpText && (
            <p className="mt-0.5 max-w-[52ch] text-caption text-text-muted">{entry.helpText}</p>
          )}
          {/* Why an unexpected row is on the list at all. */}
          {entry.whyRequired && (
            <p className="mt-0.5 max-w-[52ch] text-caption text-text-subtle">
              Required because {entry.whyRequired}.
            </p>
          )}
        </div>
      </TableCell>

      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge kind="document" status={entry.status} />
          {entry.expired && <Badge tone="danger">Expired</Badge>}
          {active && <StatusBadge kind="scan" status={active.file.scanStatus} />}
        </div>
        {entry.status === 'REJECTED' && entry.verifyRemarks && (
          <p className="mt-1 max-w-[40ch] text-caption text-danger">{entry.verifyRemarks}</p>
        )}
        {entry.status === 'VERIFIED' && entry.verifiedByName && (
          <p className="mt-1 text-caption text-text-muted">by {entry.verifiedByName}</p>
        )}
      </TableCell>

      <TableCell>
        {active ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex items-center gap-1.5 text-small text-text">
              <span className="tabular-nums font-medium">V{active.versionNo}</span>
              {entry.versions.length > 1 && (
                <span className="inline-flex items-center gap-1 text-caption text-primary">
                  <History className="size-3" aria-hidden />
                  {entry.versions.length} versions
                </span>
              )}
            </span>
            <span className="block max-w-[24ch] truncate text-caption text-text-muted">
              {active.file.originalName}
            </span>
          </button>
        ) : (
          <span className="text-small text-text-subtle">—</span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {active && <FileActions version={active} />}

          {canVerify && active && (
            <Button size="sm" variant="ghost" onClick={onVerify}>
              <ShieldCheck className="size-4" />
              Check
            </Button>
          )}

          {uploadAllowed && (
            <Button size="sm" variant={entry.satisfied ? 'ghost' : 'secondary'} onClick={onUpload}>
              <Upload className="size-4" />
              {entry.currentVersionNo > 0 ? 'Replace' : 'Upload'}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Preview, then download.
 *
 * Both are disabled — with the reason — while the antivirus scan is
 * outstanding. A greyed-out button with no explanation reads as a broken
 * product; "still being checked" reads as a system doing its job.
 */
function FileActions({ version }: { version: DocumentVersionRow }) {
  if (!version.downloadable) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button size="sm" variant="ghost" disabled>
              <Clock className="size-4" />
              <span className="sr-only">Not yet available</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          This file has not cleared the virus check yet, so it cannot be opened.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      {version.previewable && (
        <Button asChild size="sm" variant="ghost">
          <a
            href={`/api/documents/versions/${version.id}/preview`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Eye className="size-4" />
            <span className="sr-only">Preview version {version.versionNo}</span>
          </a>
        </Button>
      )}
      <Button asChild size="sm" variant="ghost">
        <a href={`/api/documents/versions/${version.id}/download`}>
          <Download className="size-4" />
          <span className="sr-only">Download version {version.versionNo}</span>
        </a>
      </Button>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Version history
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every version, newest first, with the decision made about each.
 *
 * A superseded version stays downloadable: an officer's rejection was a
 * decision about specific bytes, and a decision whose subject has been deleted
 * cannot be reviewed by anybody afterwards.
 */
function VersionHistory({ entry }: { entry: ChecklistEntry }) {
  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-caption uppercase tracking-wide text-text-muted">
        {entry.name} — every version
      </p>
      <ul className="space-y-2">
        {entry.versions.map((version) => (
          <li
            key={version.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface px-3 py-2"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-small text-text">
                <span className="font-medium tabular-nums">V{version.versionNo}</span>
                <StatusBadge kind="document" status={version.status} />
                {version.isActive && <Badge tone="outline">Current</Badge>}
              </p>
              <p className="mt-0.5 truncate text-caption text-text-muted">
                {version.file.originalName} · {formatBytes(version.file.sizeBytes)} ·{' '}
                {version.uploadedByName} ·{' '}
                {new Date(version.uploadedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {version.expiresOn && (
                  <>
                    {' '}
                    · valid until{' '}
                    {new Date(version.expiresOn).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </>
                )}
              </p>
              {version.remarks && (
                <p className="mt-0.5 max-w-[60ch] text-caption text-text-muted">{version.remarks}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <FileActions version={version} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Verification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An officer's decision on one document.
 *
 * Rejecting requires a remark, and the button stays disabled until there is
 * one. An applicant told only "rejected" has to telephone the office to find
 * out what to change — a cost paid by both sides for a sentence nobody wrote.
 */
function VerifyDialog({
  entry,
  onClose,
  onDone,
}: {
  entry: ChecklistEntry | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [remarks, setRemarks] = React.useState('');
  const [busy, setBusy] = React.useState<'VERIFY' | 'REJECT' | null>(null);

  React.useEffect(() => {
    if (entry) setRemarks('');
  }, [entry]);

  async function decide(decision: 'VERIFY' | 'REJECT') {
    if (!entry?.documentId) return;
    setBusy(decision);

    try {
      await api.post(`/api/documents/${entry.documentId}/verify`, { decision, remarks });
      toast.success(decision === 'VERIFY' ? 'Document verified' : 'Document rejected', {
        description: entry.name,
      });
      onDone();
    } catch (error) {
      toast.error('Could not record that decision', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>Check {entry.name}</DialogTitle>
              <DialogDescription>
                Version {entry.currentVersionNo}, uploaded{' '}
                {entry.versions[0]
                  ? new Date(entry.versions[0].uploadedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : ''}
                . The decision is recorded against this version.
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
              <Field
                label="Remarks"
                htmlFor="verify-remarks"
                required={false}
                hint="Required when rejecting. The applicant sees this, so say what must change."
              >
                <Textarea
                  id="verify-remarks"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  maxLength={1000}
                  placeholder="Not signed by a registered structural engineer."
                />
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => decide('REJECT')}
                loading={busy === 'REJECT'}
                disabled={busy !== null || remarks.trim().length === 0}
              >
                <X className="size-4" />
                Reject
              </Button>
              <Button
                variant="primary"
                onClick={() => decide('VERIFY')}
                loading={busy === 'VERIFY'}
                disabled={busy !== null}
              >
                <Check className="size-4" />
                Verify
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Ordering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Outstanding first, then rejected, then everything settled.
 *
 * A checklist sorted by configuration order is a checklist somebody has to
 * read all of. The work is at the top.
 */
function sortForWork(entries: ChecklistEntry[]): ChecklistEntry[] {
  const rank = (entry: ChecklistEntry): number => {
    if (entry.status === 'REJECTED') return 0;
    if (entry.isRequired && entry.isMandatory && !entry.satisfied) return 1;
    if (!entry.satisfied) return 2;
    return 3;
  };

  return [...entries].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export { FileText };
