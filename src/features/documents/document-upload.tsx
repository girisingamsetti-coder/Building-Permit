'use client';

import * as React from 'react';
import { Upload, X, FileUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { describeFileProblem, formatBytes } from '@/lib/documents';
import type { ChecklistEntry } from './types';

/**
 * Uploading one document, or replacing one already there.
 *
 * ── Why the document type is not a dropdown ────────────────────────────
 *
 * The panel is opened FROM a checklist row, so the type is already decided.
 * Asking again would invite the commonest filing mistake there is —
 * a sale deed uploaded against the encumbrance-certificate row — and produce a
 * checklist that looks complete while the department has the wrong papers.
 *
 * XMLHttpRequest rather than fetch, for the same reason as the drawing panel:
 * `fetch` cannot report upload progress, and a scanned deed over a municipal
 * connection takes long enough that "is this working?" is a real question.
 *
 * The client-side check is a courtesy that saves a slow upload ending in a
 * rejection. It decides nothing — the server re-checks size, extension,
 * declared type and the file's actual magic bytes.
 */
export function DocumentUpload({
  applicationId,
  entry,
  onUploaded,
  onCancel,
}: {
  applicationId: string;
  entry: ChecklistEntry;
  onUploaded: () => void;
  onCancel: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const xhrRef = React.useRef<XMLHttpRequest | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [remarks, setRemarks] = React.useState('');
  const [expiresOn, setExpiresOn] = React.useState<Date | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const busy = progress !== null;
  const replacing = entry.currentVersionNo > 0;
  const accept = entry.allowedExtensions.map((e) => `.${e}`).join(',');

  // Abort an upload in flight if the panel unmounts, rather than leaving a
  // request writing to an application the user has navigated away from.
  React.useEffect(() => () => xhrRef.current?.abort(), []);

  function choose(next: File | null) {
    setError(null);
    if (!next) return setFile(null);

    const problem = describeFileProblem(next, {
      maxBytes: entry.maxBytes,
      extensions: entry.allowedExtensions,
    });

    if (problem) {
      setError(problem);
      setFile(null);
      return;
    }
    setFile(next);
  }

  function upload() {
    if (!file) return;

    if (entry.requiresExpiry && !expiresOn) {
      setError(`${entry.name} has an expiry date. Enter the date it is valid until.`);
      return;
    }

    setError(null);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);
    form.append('documentTypeId', entry.documentTypeId);
    if (remarks.trim()) form.append('remarks', remarks.trim());
    if (expiresOn) form.append('expiresOn', expiresOn.toISOString());

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      xhrRef.current = null;
      setProgress(null);

      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success(replacing ? `${entry.name} replaced` : `${entry.name} uploaded`, {
          description: replacing
            ? `This is version ${entry.currentVersionNo + 1}. The previous one is kept.`
            : file.name,
        });
        setFile(null);
        setRemarks('');
        if (inputRef.current) inputRef.current.value = '';
        onUploaded();
        return;
      }

      let message = 'That upload was refused.';
      try {
        message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
      } catch {
        /* Not JSON — keep the generic sentence. */
      }
      setError(message);
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      setProgress(null);
      setError('The upload could not reach the server. Check your connection and try again.');
    };

    xhr.onabort = () => {
      xhrRef.current = null;
      setProgress(null);
    };

    xhr.open('POST', `/api/applications/${applicationId}/documents`);
    xhr.send(form);
  }

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded border border-danger/30 bg-danger-bg px-3 py-2 text-small text-danger"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {/* The rejection remark is repeated here, where the correction is being
          made. Making somebody close a dialog to re-read why their document
          was refused is how the same mistake gets uploaded twice. */}
      {entry.status === 'REJECTED' && entry.verifyRemarks && (
        <div className="rounded border border-warning/30 bg-warning-bg px-3 py-2.5">
          <p className="text-caption font-medium uppercase tracking-wide text-warning">
            Why the last one was rejected
          </p>
          <p className="mt-0.5 text-small text-text">{entry.verifyRemarks}</p>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) choose(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          'rounded border-2 border-dashed p-6 text-center transition-colors',
          dragging ? 'border-primary bg-primary-subtle' : 'border-border-strong bg-surface-sunk',
          busy && 'opacity-60'
        )}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <CheckCircle2 className="size-5 shrink-0 text-success" />
            <div className="min-w-0 text-left">
              <p className="truncate text-small font-medium text-text">{file.name}</p>
              <p className="text-caption text-text-muted">{formatBytes(file.size)}</p>
            </div>
            {!busy && (
              <Button size="icon" variant="ghost" onClick={() => choose(null)} aria-label="Remove file">
                <X className="size-4" />
              </Button>
            )}
          </div>
        ) : (
          <>
            <FileUp className="mx-auto mb-2 size-6 text-text-subtle" aria-hidden />
            <p className="text-small text-text">
              Drag the {entry.name.toLowerCase()} here, or{' '}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                browse for it
              </button>
              .
            </p>
            <p className="mt-1 text-caption text-text-muted">
              {entry.allowedExtensions.map((e) => e.toUpperCase()).join(', ')}, up to{' '}
              {formatBytes(entry.maxBytes)}.
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          aria-label={`Choose the ${entry.name}`}
        />
      </div>

      {busy && (
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-caption text-text-muted" aria-live="polite">
              Uploading… {progress}%
            </p>
            <button
              type="button"
              onClick={() => xhrRef.current?.abort()}
              className="rounded text-caption text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Cancel
            </button>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunk"
            role="progressbar"
            aria-valuenow={progress ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {entry.requiresExpiry && (
        <Field
          label="Valid until"
          htmlFor="document-expiry"
          required
          hint="This document stops counting towards completeness after this date."
        >
          <DatePicker
            id="document-expiry"
            value={expiresOn}
            onChange={(date) => setExpiresOn(date ?? null)}
            disabled={busy}
            placeholder="Choose the date"
            fromYear={new Date().getFullYear()}
            toYear={new Date().getFullYear() + 20}
          />
        </Field>
      )}

      <Field
        label="Remarks"
        htmlFor="document-remarks"
        hint={
          replacing
            ? 'What changed in this version? This is shown beside it in the history.'
            : 'Optional note for the reviewing officer.'
        }
      >
        <Input
          id="document-remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          disabled={busy}
          maxLength={1000}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={upload} disabled={!file || busy} loading={busy}>
          <Upload className="size-4" />
          {replacing ? `Upload version ${entry.currentVersionNo + 1}` : 'Upload'}
        </Button>
      </div>
    </div>
  );
}
