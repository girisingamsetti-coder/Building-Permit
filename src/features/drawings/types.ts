/**
 * Shapes the drawing and scrutiny screens receive.
 *
 * Declared rather than inferred from Prisma because these cross the
 * server/client boundary, where `serialize()` has already turned every Date
 * into an ISO string.
 */

export type ScrutinyResultSummary = {
  id: string;
  outcome: 'PASS' | 'FAIL';
  summary: string;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  infoCount: number;
  checksRun: number;
  checksPassed: number;
  evaluatedAt: string;
  report: { id: string; isDemo: boolean; generatedAt: string } | null;
};

export type ScrutinyRequestSummary = {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'ERRORED' | 'CANCELLED';
  engineDriver: string;
  attempt: number;
  requestedAt: string;
  completedAt: string | null;
  errorMessage: string;
  result: ScrutinyResultSummary | null;
};

export type DrawingVersionRow = {
  id: string;
  versionNo: number;
  remarks: string;
  uploadedById: string;
  uploadedByName: string;
  uploadedAt: string;
  isActive: boolean;
  downloadable: boolean;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: string;
    checksumSha256: string;
  };
  latestScrutiny: ScrutinyRequestSummary | null;
  scrutinyOutcome: 'PASS' | 'FAIL' | null;
};

export type DrawingRow = {
  id: string;
  applicationId: string;
  category: string;
  discipline: string;
  title: string;
  currentVersionNo: number;
  createdAt: string;
  updatedAt: string;
  versions: DrawingVersionRow[];
};

export type DrawingsPayload = {
  application: {
    id: string;
    applicationNumber: string;
    status: string;
    requiresScrutiny: boolean;
  };
  drawings: DrawingRow[];
  canUpload: boolean;
  uploadBlockedReason: string | null;
  categories: Array<{ code: string; label: string }>;
  maxUploadBytes: number;
};

// ── Scrutiny ─────────────────────────────────────────────────────────────

export type ScrutinyIssueRow = {
  id: string;
  ruleCode: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  title: string;
  description: string;
  expectedValue: string;
  actualValue: string;
  layer: string;
  rule: { category: string; remedy: string; reference: string } | null;
};

export type ScrutinyRunRow = {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'ERRORED' | 'CANCELLED';
  engineDriver: string;
  attempt: number;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string;
  drawingVersion: {
    id: string;
    versionNo: number;
    isActive: boolean;
    drawing: { id: string; title: string; category: string };
  };
  result: (ScrutinyResultSummary & { issues: ScrutinyIssueRow[] }) | null;
};

export type ScrutinyPayload = {
  application: {
    id: string;
    applicationNumber: string;
    status: string;
    requiresScrutiny: boolean;
  };
  canRequest: boolean;
  requestBlockedReason: string | null;
  current: ScrutinyRunRow[];
  history: ScrutinyRunRow[];
  totals: {
    checksRun: number;
    checksPassed: number;
    critical: number;
    major: number;
    minor: number;
    info: number;
  };
};
