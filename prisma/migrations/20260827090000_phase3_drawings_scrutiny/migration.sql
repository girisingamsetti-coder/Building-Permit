-- Phase 3 — drawings and scrutiny.
--
-- Additive. `drawings`, `drawing_versions`, `file_objects`, `scrutiny_rules`,
-- `scrutiny_requests`, `scrutiny_results`, `scrutiny_issues` and
-- `scrutiny_reports` were all created by the Phase 0 init migration and are
-- NOT rebuilt here. This adds the four columns the Phase 3 UI needs and the
-- indexes the drawing/scrutiny read paths actually use.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Drawing category
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The sheet type an LTP thinks in: site plan, floor plan, elevation, section,
-- parking plan, structural drawing, other.
--
-- TEXT backed by `master_data`, not an enum. The requirement asks for
-- configurable categories, and an enum would make adding one a migration over
-- live data. `discipline` already exists for the orthogonal axis a scrutiny
-- engine routes on and is derived from the category, so nobody is asked for
-- the same fact twice.

ALTER TABLE "drawings"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'OTHER';

-- The drawings tab lists a single application's sheets, newest first.
CREATE INDEX IF NOT EXISTS "drawings_applicationId_category_idx"
  ON "drawings" ("applicationId", "category");

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Rule remedy
-- ═══════════════════════════════════════════════════════════════════════════
--
-- What to DO about a finding. A scrutiny report that says a setback is short
-- but not what to change wastes a correction cycle, and the correction cycle
-- is the expensive part of this process for everyone.

ALTER TABLE "scrutiny_rules"
  ADD COLUMN "remedy" TEXT NOT NULL DEFAULT '';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Check tallies on the result
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "18 of 21 checks passed" is the first number an LTP reads, and it cannot be
-- derived from the issue rows: a run that evaluated 21 rules and one that
-- evaluated 3 both record 3 failures. So the denominator is recorded at
-- evaluation time, by whichever provider produced the result.
--
-- `infoCount` completes the severity tally — INFO issues exist in the
-- IssueSeverity enum and were the only one without a column.

ALTER TABLE "scrutiny_results"
  ADD COLUMN "infoCount"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "checksRun"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "checksPassed" INTEGER NOT NULL DEFAULT 0;

-- A run cannot pass more checks than it ran, nor a negative number of them.
ALTER TABLE "scrutiny_results"
  ADD CONSTRAINT "checks_passed_within_run"
  CHECK ("checksPassed" >= 0 AND "checksRun" >= 0 AND "checksPassed" <= "checksRun");

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Hot predicates for the scrutiny read paths
-- ═══════════════════════════════════════════════════════════════════════════

-- "Is a run already in flight for this version?" — the guard that stops a
-- double-clicked button queueing two engine runs for one drawing.
CREATE INDEX IF NOT EXISTS "scrutiny_requests_in_flight"
  ON "scrutiny_requests" ("drawingVersionId")
  WHERE status IN ('QUEUED', 'RUNNING');

-- The worker's claim predicate.
CREATE INDEX IF NOT EXISTS "scrutiny_requests_status_requestedAt_idx"
  ON "scrutiny_requests" ("status", "requestedAt");

-- Issues are always read grouped by their result and ordered by severity;
-- the Phase 0 index covers that. This one serves "every issue ever raised
-- against rule X", which the admin rule catalogue needs.
CREATE INDEX IF NOT EXISTS "scrutiny_issues_ruleCode_idx"
  ON "scrutiny_issues" ("ruleCode");
