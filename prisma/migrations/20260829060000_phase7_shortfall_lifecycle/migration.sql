-- Phase 7 — the shortfall lifecycle.
--
-- The old enum had four working states (OPEN · RESPONDED · UNDER_REVIEW ·
-- RESOLVED) and could not distinguish "raised but nobody has been told" from
-- "the applicant has it". That distinction is the point of this phase: a
-- shortfall resting at RAISED means the notification never went out, and from
-- the applicant's side that is indistinguishable from silence.
--
-- The type is REPLACED rather than extended. `ALTER TYPE … ADD VALUE` would
-- leave OPEN, RESPONDED and REJECTED in the type for ever, and a value that
-- still exists is a value something will eventually write.

-- ── 1. The new kind ────────────────────────────────────────────────────────
ALTER TYPE "ShortfallKind" ADD VALUE IF NOT EXISTS 'OTHER';

-- ── 2. The new lifecycle ───────────────────────────────────────────────────
CREATE TYPE "ShortfallStatus_new" AS ENUM (
  'RAISED',
  'NOTIFIED',
  'ACTION_REQUIRED',
  'RESOLUTION_SUBMITTED',
  'UNDER_REVIEW',
  'RESOLVED',
  'RESOLUTION_REJECTED',
  'CANCELLED'
);

-- The index and every other object reading the column has to come off first.
DROP INDEX IF EXISTS "open_shortfalls_by_application";
DROP INDEX IF EXISTS "shortfalls_status_mode_idx";

ALTER TABLE "shortfalls" ALTER COLUMN "status" DROP DEFAULT;

-- The mapping, and the reasoning for each:
--
--   OPEN         → ACTION_REQUIRED       the applicant already has it; a row
--                                        that existed was, by definition, one
--                                        somebody had been told about
--   RESPONDED    → RESOLUTION_SUBMITTED  the same state under its new name
--   UNDER_REVIEW → UNDER_REVIEW
--   RESOLVED     → RESOLVED
--   REJECTED     → CANCELLED             the old REJECTED meant "abandoned,
--                                        nobody will answer it", which is what
--                                        CANCELLED now means. The rejection of
--                                        one ATTEMPT is RESOLUTION_REJECTED and
--                                        is a different thing entirely.
--   CANCELLED    → CANCELLED
ALTER TABLE "shortfalls"
  ALTER COLUMN "status" TYPE "ShortfallStatus_new"
  USING (
    CASE "status"::text
      WHEN 'OPEN'         THEN 'ACTION_REQUIRED'
      WHEN 'RESPONDED'    THEN 'RESOLUTION_SUBMITTED'
      WHEN 'UNDER_REVIEW' THEN 'UNDER_REVIEW'
      WHEN 'RESOLVED'     THEN 'RESOLVED'
      WHEN 'REJECTED'     THEN 'CANCELLED'
      WHEN 'CANCELLED'    THEN 'CANCELLED'
    END
  )::"ShortfallStatus_new";

DROP TYPE "ShortfallStatus";
ALTER TYPE "ShortfallStatus_new" RENAME TO "ShortfallStatus";

ALTER TABLE "shortfalls" ALTER COLUMN "status" SET DEFAULT 'RAISED';

-- ── 3. The new columns ─────────────────────────────────────────────────────
ALTER TABLE "shortfalls" ADD COLUMN "requiredAction" TEXT NOT NULL DEFAULT '';
ALTER TABLE "shortfalls" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- ── 4. The approval guard's predicate, restated over the new lifecycle ─────
--
-- Open means "not settled and not abandoned". Every state except RESOLVED and
-- CANCELLED blocks approval — including RAISED, which is the case where the
-- applicant has not even been told yet and is therefore the LAST state in
-- which an approval should slip through.
CREATE INDEX IF NOT EXISTS "open_shortfalls_by_application"
  ON "shortfalls" ("applicationId")
  WHERE status NOT IN ('RESOLVED', 'CANCELLED');

CREATE INDEX IF NOT EXISTS "shortfalls_status_mode_idx"
  ON "shortfalls" ("status", "mode");

-- Rows that predate this phase were raised when there was no notification step
-- at all, and the old OPEN meant "the applicant has it". Backfilling
-- `notifiedAt` from `raisedAt` records that as what it was, rather than
-- leaving history claiming nobody was ever told.
UPDATE "shortfalls"
   SET "notifiedAt" = "raisedAt"
 WHERE "notifiedAt" IS NULL AND "status" <> 'RAISED';

-- A shortfall that has been told to somebody has a time it was told, and one
-- that has not, has not. Without this the two can disagree, and `notifiedAt`
-- is what an administrator reads when asking why an applicant says they never
-- heard anything.
ALTER TABLE "shortfalls"
  ADD CONSTRAINT "shortfall_notified_has_time"
  CHECK (("status" = 'RAISED') = ("notifiedAt" IS NULL));
