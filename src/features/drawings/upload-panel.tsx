'use client';

import * as React from 'react';
import { Upload, X, FileUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  DRAWING_ACCEPT,
  DRAWING_CATEGORIES,
  describeFileProblem,
  formatBytes,
} from '@/lib/drawings';

/**
 * The drawing upload panel — drag and drop, browse, and real upload progress.
 *
 * ── Why XMLHttpRequest and not fetch ───────────────────────────────────
 *
 * `fetch` cannot report upload progress: there is no readable stream for the
 * request body in browsers, so a fetch-based upload can only show an
 * indeterminate spinner. A 20 MB CAD file over a municipal office connection
 * takes long enough that "is this working?" becomes a real question, so this
 * uses XHR to get genuine `upload.onprogress` events and shows a true
 * percentage.
 *
 * ── Client validation is a courtesy ────────────────────────────────────
 *
 * `describeFileProblem` refuses obviously wrong files before the bytes are
 * sent, which saves a slow upload ending in a rejection. It decides nothing:
 * the server re-checks size, extension, declared type AND the file's actual
 * magic bytes, and only that check counts.
 */

type Props = {
  applicationId: string;
  categories: Array<{ code: string; label: string }>;
  maxUploadBytes: number;
  /** Present when adding a version to an existing sheet. */
  drawingId?: string;
  defaultCategory?: string;
  defaultTitle?: string;
  onUploaded: () => void;
  onCancel?: () => void;
};

export function UploadPanel({
  applicationId,
  categories,
  maxUploadBytes,
  drawingId,
  defaultCategory,
  defaultTitle,
  onUploaded,
  onCancel,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const xhrRef = React.useRef<XMLHttpRequest | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [category, setCategory] = React.useState(defaultCategory ?? 'SITE_PLAN');
  const [title, setTitle] = React.useState(defaultTitle ?? '');
  const [remarks, setRemarks] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const options = categories.length
    ? categories
    : DRAWING_CATEGORIES.map((c) => ({ code: c.code, label: c.label }));

  const busy = progress !== null;

  // Abort an upload in flight if the panel unmounts, rather than leaving a
  // request writing to an application the user has navigated away from.
  React.useEffect(() => () => xhrRef.current?.abort(), []);

  function choose(next: File | null) {
    setError(null);
    if (!next) return setFile(null);

    const problem = describeFileProblem(next, maxUploadBytes);
    if (problem) {
      setError(problem);
      setFile(null);
      return;
    }
    setFile(next);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    // Only the first file: a drawing version is one sheet, and silently
    // uploading five would be worse than asking again.
    choose(e.dataTransfer.files?.[0] ?? null);
  }

  function upload() {
    if (!file) return;
    setError(null);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);
    form.append('category', category);
    if (title.trim()) form.append('title', title.trim());
    if (remarks.trim()) form.append('remarks', remarks.trim());
    if (drawingId) form.append('drawingId', drawingId);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      xhrRef.current = null;
      setProgress(null);

      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success('Drawing uploaded', {
          description: drawingId ? 'A new version has been created.' : file.name,
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

    xhr.open('POST', `/api/applications/${applicationId}/drawings`);
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

      {/* ── Dropzone ──────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
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
              Drag a drawing here, or{' '}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                browse for one
              </button>
              .
            </p>
            <p className="mt-1 text-caption text-text-muted">
              PDF, DWG or DXF, up to {formatBytes(maxUploadBytes)}.
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={DRAWING_ACCEPT}
          className="sr-only"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          // Announced to screen readers; the visible control is the button above.
          aria-label="Choose a drawing file"
        />
      </div>

      {/* ── Progress ──────────────────────────────────────────────────── */}
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

      {/* ── Particulars ───────────────────────────────────────────────── */}
      {!drawingId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sheet type" htmlFor="drawing-category" required>
            <Select value={category} onValueChange={setCategory} disabled={busy}>
              <SelectTrigger id="drawing-category">
                <SelectValue placeholder="Choose a sheet type" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Title"
            htmlFor="drawing-title"
            hint="Optional. Defaults to the sheet type."
          >
            <Input
              id="drawing-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="Ground floor plan"
            />
          </Field>
        </div>
      )}

      <Field
        label="Remarks"
        htmlFor="drawing-remarks"
        hint={
          drawingId
            ? 'What changed in this version? This is shown beside it in the history.'
            : 'Optional note for the reviewing officer.'
        }
      >
        <Input
          id="drawing-remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          disabled={busy}
          placeholder={drawingId ? 'Corrected front setback and parking layout' : ''}
        />
      </Field>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button variant="primary" onClick={upload} disabled={!file || busy} loading={busy}>
          <Upload className="size-4" />
          {drawingId ? 'Upload new version' : 'Upload drawing'}
        </Button>
      </div>
    </div>
  );
}
