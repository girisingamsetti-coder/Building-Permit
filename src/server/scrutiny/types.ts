import 'server-only';

/**
 * The scrutiny integration boundary — docs/07-subsystems.md P.7.
 *
 * This interface is the ONLY thing business code may depend on. No service,
 * guard, route or component learns which driver is live; they write a
 * `ScrutinyRequest` and apply whatever `ScrutinyOutcome` comes back, from
 * wherever it comes.
 *
 * ── Three delivery styles, one service ─────────────────────────────────
 *
 * We do not yet know how a real engine will deliver results, so all three
 * shapes are accommodated:
 *
 *   synchronous  submit() returns a terminal outcome
 *   polled       submit() returns pending; the worker calls poll()
 *   callback     submit() returns pending; the engine POSTs to our callback
 *
 * `applyOutcome()` in services/scrutiny.ts is the single place an outcome
 * becomes state, so all three paths converge on identical behaviour rather
 * than on three near-identical implementations.
 */

export type ScrutinySeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';

/** What the engine is asked to check. */
export type ScrutinySubmission = {
  /** Our reference, echoed back by providers that support it. */
  requestId: string;
  applicationId: string;
  applicationNumber: string;
  drawingVersionId: string;
  /** Version number of the drawing under test. The mock's ladder reads this. */
  versionNo: number;
  drawingCategory: string;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
  };
  /**
   * The particulars the drawing is checked AGAINST — plot area, setbacks,
   * FAR, parking, height, road width. A real engine reads these from the
   * drawing; supplying them lets a provider cross-check the two, and lets the
   * mock produce findings that reference the application's own numbers.
   */
  context: ScrutinyContext;
};

export type ScrutinyContext = {
  plotAreaSqm: number | null;
  roadWidthM: number;
  builtUpAreaSqm: number | null;
  floorAreaSqm: number;
  coverageAreaSqm: number;
  parkingAreaSqm: number;
  achievedFar: number;
  achievedCoverage: number;
  numFloors: number;
  numBasements: number;
  numDwellingUnits: number;
  buildingHeightM: number;
  setbackFrontM: number;
  setbackRearM: number;
  setbackLeftM: number;
  setbackRightM: number;
  buildingUse: string;
  occupancyType: string;
};

export type ScrutinyIssueInput = {
  ruleCode: string;
  severity: ScrutinySeverity;
  title: string;
  description: string;
  expectedValue?: string;
  actualValue?: string;
  layer?: string;
  /** Page and coordinates, for a future drawing overlay. */
  locationHint?: Record<string, unknown>;
};

export type ScrutinyOutcome = {
  externalRef: string;
  outcome: 'PASS' | 'FAIL';
  summary: string;
  /** How many rules were evaluated, and how many the drawing satisfied. */
  checksRun: number;
  checksPassed: number;
  issues: ScrutinyIssueInput[];
  /** The provider's own payload, stored verbatim for later forensics. */
  raw: unknown;
};

/**
 * What `submit()` returns.
 *
 * `terminal` carries the result inline. `pending` means the answer arrives
 * later, by polling or callback, and `retryAfterMs` is the provider's hint for
 * when to look.
 */
export type ScrutinyAck =
  | { kind: 'terminal'; outcome: ScrutinyOutcome }
  | { kind: 'pending'; externalRef: string; retryAfterMs?: number };

export interface ScrutinyProvider {
  readonly name: string;
  /**
   * False when the driver is selected but unusable. Checked before a request
   * is written, so an unconfigured engine produces a clear refusal rather
   * than a queued job that dies five times.
   */
  readonly configured: boolean;
  /**
   * True when results carry no compliance weight. Drives the
   * "DEMO SCRUTINY — NOT A COMPLIANCE CERTIFICATE" watermark on reports and
   * the equivalent label in the UI. Provenance is also recorded per request in
   * `scrutiny_requests.engineDriver`, so this is answerable years later.
   */
  readonly isDemo: boolean;

  submit(input: ScrutinySubmission): Promise<ScrutinyAck>;

  /**
   * Checks on a pending request. Returns null while the engine is still
   * working; the worker reschedules and asks again.
   *
   * Takes the SUBMISSION as well as the ref, which refines the P.7 sketch. A
   * provider that keeps server-side state ignores the second argument; one
   * that does not is saved from re-querying the database to rebuild something
   * it already sent. The service always has the submission to hand, so
   * passing it costs nothing.
   */
  poll?(externalRef: string, submission: ScrutinySubmission): Promise<ScrutinyOutcome | null>;

  /** Parses and VERIFIES a provider-initiated callback. */
  parseCallback?(req: Request): Promise<ScrutinyOutcome>;
}
