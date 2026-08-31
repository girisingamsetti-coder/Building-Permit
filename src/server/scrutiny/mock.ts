import 'server-only';
import { createHash } from 'node:crypto';
import { env } from '@/server/config/env';
import { settingString, settingNumber } from '@/server/services/settings';
import { serviceUnavailable } from '@/server/http/errors';
import { isBlocking } from '@/lib/drawings';
import type {
  ScrutinyAck,
  ScrutinyContext,
  ScrutinyIssueInput,
  ScrutinyOutcome,
  ScrutinyProvider,
  ScrutinySeverity,
  ScrutinySubmission,
} from './types';

/**
 * The mock scrutiny engine — docs/07-subsystems.md P.7.
 *
 * ── What this is for, and what it is not ───────────────────────────────
 *
 * It exists to make the drawing → scrutiny → correction → re-scrutiny
 * lifecycle testable end to end. It does NOT read the drawing, and it does not
 * assess compliance with anything. It is built so nobody can mistake it for
 * something that does:
 *
 *   · `isDemo` is true, so every report it produces is watermarked
 *     "DEMO SCRUTINY — NOT A COMPLIANCE CERTIFICATE" and the UI says the same.
 *   · `scrutiny_requests.engineDriver` records "mock" against every result,
 *     forever — an officer opening a two-year-old file can tell.
 *   · It REFUSES to run in production unless someone has explicitly set
 *     ALLOW_MOCK_SCRUTINY_IN_PRODUCTION. Shipping without a real engine is
 *     then a deliberate act with a trail, not an oversight.
 *
 * ── Why the findings are worded the way they are ───────────────────────
 *
 * Every issue describes a generic CONDITION and never presents a number as
 * law. No byelaw schedule has been supplied (architectural Rule 6), so a
 * finding saying "front setback must be 3 m" would be inventing legislation.
 * Instead findings say the drawing could not be reconciled with the
 * particulars, quote the applicant's OWN declared figure as the actual value,
 * and give a remedy the LTP can act on.
 *
 * ── Determinism ────────────────────────────────────────────────────────
 *
 * Which rules are flagged comes from `sha256(applicationId + versionNo)`, so a
 * reseeded database reproduces an identical demo and a test asserting "V1
 * fails on the setback rule" stays true.
 */

type MockMode = 'VERSION_LADDER' | 'ALWAYS_PASS' | 'ALWAYS_FAIL' | 'SEEDED_RANDOM';

/**
 * The catalogue the mock draws findings from.
 *
 * Codes match the seeded `scrutiny_rules` rows, so an issue always resolves to
 * a rule with a severity, a category and a remedy. `reference` on those rows
 * is deliberately empty — see the seed.
 */
const BLOCKING_POOL = [
  'SETBACK_FRONT',
  'SETBACK_REAR',
  'SETBACK_SIDE',
  'FAR_LIMIT',
  'COVERAGE_LIMIT',
  'PARKING_PROVISION',
  'HEIGHT_LIMIT',
  'ROAD_WIDTH_MIN',
] as const;

/** Advisories. Reported, but they never fail a run. */
const ADVISORY_POOL = ['PARKING_AISLE', 'OPEN_SPACE', 'NORTH_POINT', 'SCALE_DECLARED'] as const;

/** Every rule the mock claims to have evaluated. Drives `checksRun`. */
const EVALUATED = [...BLOCKING_POOL, ...ADVISORY_POOL, 'STAIR_WIDTH', 'DIM_LEGIBILITY'];

export class MockScrutinyProvider implements ScrutinyProvider {
  readonly name = 'mock';
  readonly isDemo = true;

  /**
   * A mock PASS is not a compliance decision, so in production this driver is
   * unusable unless someone has said otherwise in writing (an env var).
   */
  get configured(): boolean {
    return !env.isProduction || env.allowMockScrutinyInProduction;
  }

  private assertUsable(): void {
    if (this.configured) return;
    throw serviceUnavailable(
      'Automated scrutiny is not available: this deployment has no real scrutiny engine ' +
        'configured, and a mock result is not a compliance decision.'
    );
  }

  async submit(input: ScrutinySubmission): Promise<ScrutinyAck> {
    this.assertUsable();

    const errorRate = await settingNumber('mock_scrutiny_error_rate', 0);
    // Exercises the retry path. Thrown rather than returned, because an engine
    // that cannot be reached has not judged the drawing either way.
    if (errorRate > 0 && Math.random() < errorRate) {
      throw new Error('Mock scrutiny engine: simulated transport failure.');
    }

    const delayMs = await settingNumber('mock_scrutiny_delay_ms', 3000);

    // With no simulated latency the answer is available immediately, which is
    // what tests want. With latency, the request goes PENDING and the worker
    // polls — genuinely exercising the asynchronous path rather than letting
    // it be accidentally synchronous.
    if (delayMs <= 0) {
      return { kind: 'terminal', outcome: await this.evaluate(input) };
    }

    const readyAt = Date.now() + delayMs;
    return {
      kind: 'pending',
      externalRef: `mock:${input.requestId}:${readyAt}`,
      retryAfterMs: delayMs,
    };
  }

  /**
   * Takes the submission alongside the ref.
   *
   * The P.7 sketch shows `poll(externalRef)` alone. Passing the submission too
   * means a provider does not have to re-query the database to rebuild what it
   * already submitted — a real polled provider simply ignores the argument,
   * and the mock needs the particulars to produce findings that quote them.
   */
  async poll(externalRef: string, submission: ScrutinySubmission): Promise<ScrutinyOutcome | null> {
    this.assertUsable();

    const readyAt = Number(externalRef.split(':')[2] ?? 0);
    if (Number.isFinite(readyAt) && Date.now() < readyAt) return null;

    return this.evaluate(submission);
  }

  // ── Evaluation ─────────────────────────────────────────────────────────

  private async evaluate(input: ScrutinySubmission): Promise<ScrutinyOutcome> {
    const mode = (await settingString('mock_scrutiny_mode', 'VERSION_LADDER')) as MockMode;
    const passFrom = await settingNumber('mock_scrutiny_pass_from_version', 3);

    const shouldFail = this.decideFailure(mode, input.versionNo, passFrom, input);
    const issues = shouldFail
      ? this.blockingIssues(input)
      : this.advisoryIssues(input);

    const checksRun = EVALUATED.length;
    const checksPassed = checksRun - issues.length;
    const outcome = issues.some((i) => isBlocking(i.severity)) ? 'FAIL' : 'PASS';

    return {
      externalRef: `mock:${input.requestId}`,
      outcome,
      summary: this.summarise(outcome, issues, checksPassed, checksRun, input.versionNo),
      checksRun,
      checksPassed,
      issues,
      raw: {
        driver: 'mock',
        disclaimer:
          'Generated by MockScrutinyProvider. This is not a compliance assessment and ' +
          'carries no statutory weight.',
        mode,
        passFromVersion: passFrom,
        versionNo: input.versionNo,
        evaluatedRules: EVALUATED,
        evaluatedAt: new Date().toISOString(),
      },
    };
  }

  private decideFailure(
    mode: MockMode,
    versionNo: number,
    passFrom: number,
    input: ScrutinySubmission
  ): boolean {
    switch (mode) {
      case 'ALWAYS_PASS':
        return false;
      case 'ALWAYS_FAIL':
        return true;
      case 'SEEDED_RANDOM':
        // Deterministic per application+version, so it is reproducible.
        return this.hashByte(input, 0) % 2 === 0;
      case 'VERSION_LADDER':
      default:
        // The demo journey: V1 fails, V2 fails, V3 passes.
        return versionNo < passFrom;
    }
  }

  /**
   * One to three blocking findings, chosen deterministically, plus whatever
   * advisories the same hash selects.
   */
  private blockingIssues(input: ScrutinySubmission): ScrutinyIssueInput[] {
    const count = 1 + (this.hashByte(input, 1) % 3);
    const start = this.hashByte(input, 2) % BLOCKING_POOL.length;

    const picked: ScrutinyIssueInput[] = [];
    for (let i = 0; i < count; i += 1) {
      const code = BLOCKING_POOL[(start + i) % BLOCKING_POOL.length]!;
      picked.push(this.describe(code, input.context));
    }

    return [...picked, ...this.advisoryIssues(input)];
  }

  /** Advisories never fail a run — they are reported and moved past. */
  private advisoryIssues(input: ScrutinySubmission): ScrutinyIssueInput[] {
    const byte = this.hashByte(input, 3);
    const count = byte % 3; // 0, 1 or 2
    const start = this.hashByte(input, 4) % ADVISORY_POOL.length;

    return Array.from({ length: count }, (_, i) =>
      this.describe(ADVISORY_POOL[(start + i) % ADVISORY_POOL.length]!, input.context)
    );
  }

  /** A deterministic byte from (applicationId, versionNo, salt). */
  private hashByte(input: ScrutinySubmission, salt: number): number {
    const digest = createHash('sha256')
      .update(`${input.applicationId}:${input.versionNo}:${salt}`)
      .digest();
    return digest[0] ?? 0;
  }

  /**
   * Turns a rule code into a finding.
   *
   * Note what every `expectedValue` does NOT say: a number. It states the
   * condition the drawing must satisfy, and the `actualValue` quotes the
   * applicant's own declared figure. Presenting an invented threshold as a
   * requirement would be inventing law.
   */
  private describe(code: string, ctx: ScrutinyContext): ScrutinyIssueInput {
    const n = (v: number | null, unit: string) =>
      v === null || v === undefined ? 'not declared' : `${v} ${unit} declared`;

    const map: Record<
      string,
      { severity: ScrutinySeverity; title: string; description: string; expected: string; actual: string; layer: string }
    > = {
      SETBACK_FRONT: {
        severity: 'MAJOR',
        title: 'Front setback could not be reconciled',
        description:
          'The front setback shown on the site plan does not agree with the open space implied by the declared plot extent and road frontage.',
        expected: 'Front setback consistent with the declared plot and abutting road',
        actual: n(ctx.setbackFrontM, 'm'),
        layer: 'SETBACK',
      },
      SETBACK_REAR: {
        severity: 'MAJOR',
        title: 'Rear setback could not be reconciled',
        description:
          'The rear open space shown on the site plan does not agree with the declared plot depth.',
        expected: 'Rear setback consistent with the declared plot depth',
        actual: n(ctx.setbackRearM, 'm'),
        layer: 'SETBACK',
      },
      SETBACK_SIDE: {
        severity: 'MAJOR',
        title: 'Side setback could not be reconciled',
        description:
          'The side open space differs between the site plan and the declared particulars.',
        expected: 'Side setbacks equal to the declared values on both flanks',
        actual: `left ${ctx.setbackLeftM} m, right ${ctx.setbackRightM} m declared`,
        layer: 'SETBACK',
      },
      FAR_LIMIT: {
        severity: 'CRITICAL',
        title: 'Floor area ratio could not be reconciled',
        description:
          'The floor area computed from the drawing does not agree with the floor area declared in the application particulars.',
        expected: 'Drawn floor area equal to the declared floor area',
        actual: `FAR ${ctx.achievedFar.toFixed(2)} from ${ctx.floorAreaSqm} sq m over ${n(ctx.plotAreaSqm, 'sq m')}`,
        layer: 'AREA',
      },
      COVERAGE_LIMIT: {
        severity: 'MAJOR',
        title: 'Ground coverage could not be reconciled',
        description:
          'The building footprint on the site plan does not agree with the ground coverage declared in the particulars.',
        expected: 'Drawn footprint equal to the declared ground coverage',
        actual: `${ctx.achievedCoverage.toFixed(1)}% of ${n(ctx.plotAreaSqm, 'sq m')}`,
        layer: 'AREA',
      },
      PARKING_PROVISION: {
        severity: 'MAJOR',
        title: 'Parking provision could not be reconciled',
        description:
          'The parking bays shown do not account for the declared parking area and number of dwelling units.',
        expected: 'Parking bays consistent with the declared units and parking area',
        actual: `${ctx.parkingAreaSqm} sq m for ${ctx.numDwellingUnits} unit(s) declared`,
        layer: 'PARKING',
      },
      HEIGHT_LIMIT: {
        severity: 'CRITICAL',
        title: 'Building height could not be reconciled',
        description:
          'The height on the elevation does not agree with the height declared in the particulars for the number of floors shown.',
        expected: 'Drawn height equal to the declared height',
        actual: `${ctx.buildingHeightM} m over ${ctx.numFloors} floor(s) declared`,
        layer: 'ELEVATION',
      },
      ROAD_WIDTH_MIN: {
        severity: 'CRITICAL',
        title: 'Abutting road width could not be reconciled',
        description:
          'The road width shown on the site plan does not agree with the width declared in the particulars.',
        expected: 'Drawn road width equal to the declared width',
        actual: `${ctx.roadWidthM} m declared`,
        layer: 'SITE',
      },
      PARKING_AISLE: {
        severity: 'MINOR',
        title: 'Parking aisle not dimensioned',
        description: 'Manoeuvring space between parking bays is not dimensioned on the drawing.',
        expected: 'Aisle widths dimensioned',
        actual: 'No dimension found',
        layer: 'PARKING',
      },
      OPEN_SPACE: {
        severity: 'MINOR',
        title: 'Open space not hatched',
        description: 'Required open space is not distinguished from built-up area on the site plan.',
        expected: 'Open space hatched and labelled',
        actual: 'Not distinguished',
        layer: 'SITE',
      },
      NORTH_POINT: {
        severity: 'MINOR',
        title: 'North point missing',
        description: 'The site plan does not carry a north point, so orientation cannot be read.',
        expected: 'North point shown on the site plan',
        actual: 'Not found',
        layer: 'SITE',
      },
      SCALE_DECLARED: {
        severity: 'INFO',
        title: 'Drawing scale not declared',
        description: 'No scale is stated in the title block.',
        expected: 'Scale stated in the title block',
        actual: 'Not stated',
        layer: 'TITLE_BLOCK',
      },
    };

    const spec = map[code] ?? {
      severity: 'MINOR' as ScrutinySeverity,
      title: 'Drawing could not be fully checked',
      description: 'This check could not be completed against the drawing supplied.',
      expected: 'A legible, dimensioned drawing',
      actual: 'Could not be determined',
      layer: '',
    };

    return {
      ruleCode: code,
      severity: spec.severity,
      title: spec.title,
      description: spec.description,
      expectedValue: spec.expected,
      actualValue: spec.actual,
      layer: spec.layer,
      // A real engine returns page and coordinates for a drawing overlay. The
      // mock cannot read the drawing, so it returns nothing rather than
      // fabricating a location that would point at empty paper.
      locationHint: {},
    };
  }

  private summarise(
    outcome: 'PASS' | 'FAIL',
    issues: ScrutinyIssueInput[],
    passed: number,
    run: number,
    versionNo: number
  ): string {
    const blocking = issues.filter((i) => isBlocking(i.severity)).length;
    const advisory = issues.length - blocking;

    if (outcome === 'PASS') {
      return advisory > 0
        ? `Version ${versionNo} passed ${passed} of ${run} checks, with ${advisory} advisory note(s) that do not block progress.`
        : `Version ${versionNo} passed all ${run} checks.`;
    }

    return (
      `Version ${versionNo} passed ${passed} of ${run} checks. ` +
      `${blocking} issue(s) must be corrected before the drawing can proceed` +
      (advisory > 0 ? `, and ${advisory} advisory note(s) were also raised.` : '.')
    );
  }
}
