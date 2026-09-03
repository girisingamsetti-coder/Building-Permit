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
  Eye,
  UploadCloud,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  ChevronDown,
  CheckCircle2,
  FileText,
  Clock,
  Compass,
  FileUp,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { categoryLabel, formatBytes, DRAWING_ACCEPT, describeFileProblem } from '@/lib/drawings';
import { api, ApiCallError } from '@/features/applications/api';
import { cn } from '@/lib/utils';
import type { DrawingsPayload, DrawingRow, DrawingVersionRow } from './types';

/**
 * Drawings Tab with Integrated Drawing Viewer, Upload Section, and Version History
 * Matching the exact visual layout requested by the user.
 */
export function DrawingsTab({
  initial,
  canUpload,
  canRequestScrutiny,
}: {
  initial: DrawingsPayload;
  canUpload: boolean;
  canRequestScrutiny: boolean;
}) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [running, setRunning] = React.useState(false);

  // Viewer state
  const [zoomLevel, setZoomLevel] = React.useState(100);
  const [rotation, setRotation] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => setData(initial), [initial]);

  const refresh = React.useCallback(async () => {
    try {
      const next = await api.get<DrawingsPayload>(
        `/api/applications/${initial.application.id}/drawings`
      );
      setData(next);
    } catch {
      // Keep last good state
    }
    router.refresh();
  }, [initial.application.id, router]);

  const uploadAllowed = canUpload && data.canUpload;

  // Find all versions across drawings
  const allDrawings = data.drawings;
  const primaryDrawing = allDrawings[0] || null;

  // Flatten versions
  const allVersions: Array<{
    version: DrawingVersionRow;
    drawing: DrawingRow;
  }> = React.useMemo(() => {
    const list: Array<{ version: DrawingVersionRow; drawing: DrawingRow }> = [];
    allDrawings.forEach((d) => {
      d.versions.forEach((v) => {
        list.push({ version: v, drawing: d });
      });
    });
    // Sort latest first
    return list.sort(
      (a, b) => new Date(b.version.uploadedAt).getTime() - new Date(a.version.uploadedAt).getTime()
    );
  }, [allDrawings]);

  // Selected version for viewer
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null);

  const activeItem = React.useMemo(() => {
    if (!allVersions.length) return null;
    if (selectedVersionId) {
      const found = allVersions.find((item) => item.version.id === selectedVersionId);
      if (found) return found;
    }
    return allVersions[0];
  }, [allVersions, selectedVersionId]);

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 25, 250));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const toggleFullscreen = () => setIsFullscreen((prev) => !prev);

  async function runScrutiny() {
    setRunning(true);
    try {
      const res = await api.post<{ requested: number; engineDriver: string; skipped?: boolean }>(
        `/api/applications/${initial.application.id}/scrutiny`
      );
      toast.success(res.skipped ? 'Drawing accepted' : 'Scrutiny started', {
        description: res.skipped
          ? 'This application type is not machine-checked. It moves on to documents.'
          : `${res.requested} drawing${res.requested === 1 ? '' : 's'} sent to the ${res.engineDriver} engine.`,
      });
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
      {/* ── Gate Message (if locked) ── */}
      {!uploadAllowed && data.uploadBlockedReason && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-sunk/60 px-4 py-3 text-small text-text-muted shadow-subtle">
          <Lock className="mt-0.5 size-4 shrink-0 text-text-subtle" />
          <p>{data.uploadBlockedReason}</p>
        </div>
      )}

      {/* ── Main 2-Column Split: Drawing Viewer (Left 65%) vs Upload & Version History (Right 35%) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        {/* LEFT COLUMN: Drawing Viewer */}
        <div className="lg:col-span-8">
          <Card className={cn('overflow-hidden transition-all shadow-subtle border-border/80', isFullscreen && 'fixed inset-4 z-50 flex flex-col bg-surface')}>
            {/* Viewer Header */}
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3.5 pt-4 px-5">
              <div className="flex items-center gap-3">
                <div className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <Eye className="size-4.5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-text">Drawing Viewer</CardTitle>
                  <CardDescription className="text-caption text-text-muted mt-0.5">
                    View, zoom, rotate and switch versions
                  </CardDescription>
                </div>
              </div>

              {canRequestScrutiny && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={runScrutiny}
                  loading={running}
                  className="shadow-sm"
                >
                  <ScanSearch className="size-4 mr-1.5" />
                  {data.application.requiresScrutiny ? 'Run Scrutiny' : 'Submit Drawing'}
                </Button>
              )}
            </CardHeader>

            <CardContent className="p-4 sm:p-5 flex-1 flex flex-col">
              {/* Viewer Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
                {/* Version Selector Dropdown */}
                {allVersions.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8.5 gap-2 font-medium bg-surface border-border text-text shadow-subtle hover:bg-surface-sunk"
                      >
                        <Layers className="size-3.5 text-primary" />
                        <span>v{activeItem?.version.versionNo || 1}</span>
                        <ChevronDown className="size-3 text-text-muted" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {allVersions.map((item) => (
                        <DropdownMenuItem
                          key={item.version.id}
                          onClick={() => setSelectedVersionId(item.version.id)}
                          className={cn(
                            'flex items-center justify-between text-caption py-2',
                            item.version.id === activeItem?.version.id && 'bg-primary-subtle text-primary font-semibold'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span>v{item.version.versionNo}</span>
                            <span className="text-text-muted truncate max-w-[120px]">
                              {item.version.file.originalName}
                            </span>
                          </div>
                          {item.version.isActive && (
                            <Badge tone="success" className="text-[10px] px-1.5 py-0">
                              Active
                            </Badge>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-dashed border-border bg-surface-sunk text-caption text-text-muted">
                    <Layers className="size-3.5" />
                    <span>No versions</span>
                  </div>
                )}

                {/* Viewport Control Tools */}
                <div className="flex items-center gap-1.5 bg-surface-sunk/60 border border-border/80 rounded-lg p-1 shadow-subtle">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleZoomIn}
                        className="grid size-7 place-items-center rounded hover:bg-surface text-text-muted hover:text-text transition-colors"
                        aria-label="Zoom in"
                      >
                        <ZoomIn className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Zoom in</TooltipContent>
                  </Tooltip>

                  <span className="text-[11px] font-mono font-medium text-text-muted px-1.5 tabular-nums">
                    {zoomLevel}%
                  </span>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleZoomOut}
                        className="grid size-7 place-items-center rounded hover:bg-surface text-text-muted hover:text-text transition-colors"
                        aria-label="Zoom out"
                      >
                        <ZoomOut className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Zoom out</TooltipContent>
                  </Tooltip>

                  <div className="h-4 w-px bg-border/80 mx-0.5" />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleRotate}
                        className="grid size-7 place-items-center rounded hover:bg-surface text-text-muted hover:text-text transition-colors"
                        aria-label="Rotate 90 degrees"
                      >
                        <RotateCw className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Rotate</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="grid size-7 place-items-center rounded hover:bg-surface text-text-muted hover:text-text transition-colors"
                        aria-label="Toggle fullscreen"
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
                  </Tooltip>

                  {activeItem && activeItem.version.downloadable && (
                    <>
                      <div className="h-4 w-px bg-border/80 mx-0.5" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={`/api/drawings/versions/${activeItem.version.id}/download`}
                            className="grid size-7 place-items-center rounded hover:bg-surface text-text-muted hover:text-text transition-colors"
                            aria-label="Download current version"
                          >
                            <Download className="size-3.5" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>Download file</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>

              {/* Blueprint Canvas Box */}
              <div
                className="relative flex-1 min-h-[380px] lg:min-h-[460px] rounded-xl border border-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10 overflow-hidden flex items-center justify-center p-6 select-none transition-all"
                style={{
                  backgroundImage: `radial-gradient(circle, rgba(16, 185, 129, 0.15) 1px, transparent 1px)`,
                  backgroundSize: '24px 24px',
                }}
              >
                {/* SVG Architectural Canvas Blueprint */}
                {activeItem ? (
                  <div
                    className="transition-transform duration-200 ease-out origin-center"
                    style={{
                      transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                    }}
                  >
                    <svg
                      viewBox="0 0 540 380"
                      className="w-[460px] h-[320px] max-w-full drop-shadow-md"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Outer boundary dashed line */}
                      <rect
                        x="30"
                        y="20"
                        width="480"
                        height="330"
                        stroke="#059669"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        fill="none"
                        opacity="0.8"
                      />

                      {/* Main Building Plot Block */}
                      <rect
                        x="60"
                        y="50"
                        width="240"
                        height="240"
                        stroke="#059669"
                        strokeWidth="3.5"
                        fill="#A7F3D0"
                        fillOpacity="0.45"
                        rx="2"
                      />

                      {/* Auxiliary Block / Outbuilding */}
                      <rect
                        x="330"
                        y="70"
                        width="110"
                        height="120"
                        stroke="#059669"
                        strokeWidth="3.5"
                        fill="#A7F3D0"
                        fillOpacity="0.45"
                        rx="2"
                      />

                      {/* Setback dimension arrow */}
                      <line x1="30" y1="170" x2="60" y2="170" stroke="#047857" strokeWidth="2" />
                      <polygon points="60,170 52,165 52,175" fill="#047857" />

                      {/* Rear Setback text */}
                      <text
                        x="490"
                        y="250"
                        fill="#047857"
                        fontSize="10"
                        fontWeight="bold"
                        letterSpacing="2"
                        transform="rotate(90 490 250)"
                      >
                        REAR SETBACK
                      </text>

                      {/* North Arrow Indicator */}
                      <g transform="translate(470, 20)">
                        <circle cx="12" cy="12" r="11" fill="#FFFFFF" stroke="#047857" strokeWidth="1.5" />
                        <path d="M12 4L16 14H8L12 4Z" fill="#047857" />
                        <text x="9" y="21" fill="#047857" fontSize="8" fontWeight="bold">N</text>
                      </g>
                    </svg>
                  </div>
                ) : (
                  <EmptyState
                    icon={Layers}
                    title="No Drawing Uploaded"
                    description="Upload a CAD drawing or PDF plan to view the architectural preview."
                  />
                )}

                {/* Bottom Blueprint Title Block Strip */}
                {activeItem && (
                  <div className="absolute inset-x-3 bottom-3 rounded-lg border border-border/80 bg-surface/95 backdrop-blur px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 shadow-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] font-semibold text-text truncate max-w-[200px]">
                        {activeItem.version.file.originalName}
                      </span>
                      <span className="text-[11px] text-text-subtle">·</span>
                      <span className="text-[11px] text-text-muted tabular-nums">
                        {formatBytes(activeItem.version.file.sizeBytes)}
                      </span>
                      <span className="text-[11px] text-text-subtle">·</span>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                        {activeItem.drawing.title || 'SITE PLAN'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-text-muted">
                      <span>Plot {data.application.applicationNumber}</span>
                      <span>·</span>
                      <span className="font-mono font-medium">v{activeItem.version.versionNo}</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: Upload New Drawing & Version History */}
        <div className="lg:col-span-4 space-y-4">
          {/* Card 1: Upload New Drawing */}
          <Card className="shadow-subtle border-border/80">
            <CardHeader className="pb-3 pt-4 px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid size-7.5 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <UploadCloud className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-small font-semibold text-text">Upload New Drawing</CardTitle>
                  <CardDescription className="text-caption text-text-muted mt-0.5">
                    Re-upload corrected drawings after a failed scrutiny
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-0">
              <CompactUploadBox
                applicationId={data.application.id}
                drawingId={primaryDrawing?.id}
                maxUploadBytes={data.maxUploadBytes}
                canUpload={uploadAllowed}
                onUploaded={() => void refresh()}
              />
            </CardContent>
          </Card>

          {/* Card 2: Version History */}
          <Card className="shadow-subtle border-border/80">
            <CardHeader className="pb-3 pt-4 px-5 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="grid size-7.5 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <Clock className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-small font-semibold text-text">Version History</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2 max-h-[360px] overflow-y-auto">
              {allVersions.length === 0 ? (
                <p className="text-caption text-text-muted text-center py-4">
                  No versions recorded yet.
                </p>
              ) : (
                allVersions.map((item) => {
                  const isSelected = item.version.id === activeItem?.version.id;
                  const scrutiny = item.version.latestScrutiny;
                  const isPassed =
                    item.version.scrutinyOutcome === 'PASS' ||
                    scrutiny?.result?.outcome === 'PASS';

                  return (
                    <div
                      key={item.version.id}
                      onClick={() => setSelectedVersionId(item.version.id)}
                      className={cn(
                        'group flex items-start justify-between gap-2.5 p-3 rounded-xl border transition-all cursor-pointer',
                        isSelected
                          ? 'border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-subtle'
                          : 'border-border/70 bg-surface hover:border-border-strong hover:bg-surface-sunk/50'
                      )}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-sunk text-text-muted mt-0.5 group-hover:text-primary transition-colors">
                          <FileText className="size-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-small font-medium text-text leading-tight">
                            {item.version.file.originalName}
                          </p>
                          <p className="text-[11px] text-text-muted mt-1 leading-tight">
                            {formatBytes(item.version.file.sizeBytes)} · v{item.version.versionNo} ·{' '}
                            {new Date(item.version.uploadedAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                            ,{' '}
                            {new Date(item.version.uploadedAt).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </p>
                          {item.version.remarks && (
                            <p className="text-[11px] italic text-text-subtle mt-1">
                              {item.version.remarks}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5">
                        {isPassed ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Passed
                          </span>
                        ) : item.version.scrutinyOutcome === 'FAIL' ||
                          scrutiny?.result?.outcome === 'FAIL' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Uploaded
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Compact Upload Box matching the exact UI styling in screenshot
// ═══════════════════════════════════════════════════════════════════════════

function CompactUploadBox({
  applicationId,
  drawingId,
  maxUploadBytes,
  canUpload,
  onUploaded,
}: {
  applicationId: string;
  drawingId?: string;
  maxUploadBytes: number;
  canUpload: boolean;
  onUploaded: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const busy = progress !== null;

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
    if (busy || !canUpload) return;
    choose(e.dataTransfer.files?.[0] ?? null);
  }

  function handleUpload() {
    if (!file) return;
    setError(null);
    setProgress(0);

    const form = new FormData();
    form.append('file', file);
    form.append('category', 'SITE_PLAN');
    form.append('title', file.name.replace(/\.[^/.]+$/, ''));
    if (drawingId) form.append('drawingId', drawingId);

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success('Drawing uploaded', {
          description: drawingId ? 'A new version has been created.' : file.name,
        });
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
        onUploaded();
        return;
      }

      let message = 'That upload was refused.';
      try {
        message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
      } catch {
        // Fallback
      }
      setError(message);
    };

    xhr.onerror = () => {
      setProgress(null);
      setError('Connection failed. Please retry.');
    };

    xhr.open('POST', `/api/applications/${applicationId}/drawings`);
    xhr.send(form);
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="flex items-start gap-1.5 text-caption text-danger">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy && canUpload) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => {
          if (!busy && canUpload && !file) inputRef.current?.click();
        }}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer',
          dragging
            ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
            : 'border-border-strong/80 bg-surface-sunk/30 hover:border-emerald-500/60 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10',
          busy && 'opacity-60 pointer-events-none',
          !canUpload && 'opacity-50 cursor-not-allowed'
        )}
      >
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
            <div className="text-center">
              <p className="text-small font-semibold text-text truncate max-w-[200px]">{file.name}</p>
              <p className="text-caption text-text-muted">{formatBytes(file.size)}</p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); handleUpload(); }} loading={busy}>
                Confirm Upload
              </Button>
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); choose(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid size-11 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 mb-2">
              <UploadCloud className="size-5.5" />
            </div>
            <p className="text-small font-medium text-text">Drop drawing here</p>
            <p className="text-[11px] text-text-muted mt-0.5">DWG, DXF or PDF · max 50 MB</p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={DRAWING_ACCEPT}
          className="sr-only"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          aria-label="Upload drawing file"
          disabled={!canUpload || busy}
        />
      </div>

      {busy && (
        <div className="space-y-1">
          <div className="flex justify-between text-caption text-text-muted">
            <span>Uploading…</span>
            <span className="font-mono tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
            <div
              className="h-full bg-emerald-600 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
