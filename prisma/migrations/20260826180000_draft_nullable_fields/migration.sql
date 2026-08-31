-- Phase 2 follow-up — model "not answered yet" as NULL, not as a sentinel.
--
-- ── What this corrects ─────────────────────────────────────────────────────
--
-- The filing wizard builds `applicants`, `property_details` and
-- `building_details` one step at a time, so those rows exist before every
-- mandatory value has been supplied. The first Phase 2 migration made that
-- possible by giving the mandatory columns DEFAULTS — '' for text, 0 for
-- numbers.
--
-- That works, and for `plotAreaSqm` and `builtUpAreaSqm` it is also WRONG. A
-- plot of 0 m² is not a plot that has not been measured; it is a claim, and a
-- false one. Storing it means the database cannot distinguish "the LTP has not
-- reached this step" from "the LTP entered zero", and any later reader — a
-- report, an export, a scrutiny engine — has to guess.
--
-- NULL says exactly one thing: not answered. So the columns that a completed
-- application MUST carry are now nullable, and the distinction is visible in
-- the schema itself:
--
--   nullable          → may legitimately be absent in a DRAFT, and the submit
--                       guard requires it before the application can be filed
--   NOT NULL, DEFAULT → genuinely optional even on a filed application
--                       (mandal, village, parking area, basements …)
--
-- Nothing is relaxed by this. DRAFT and SUBMITTED are different states with
-- different rules: a draft may be incomplete, a submission may not. What
-- changes is only that the incompleteness is now recorded honestly rather than
-- disguised as data. Completeness is enforced in submitApplication(), which
-- re-derives it from these rows through the same schemas the form used — see
-- tests/integration/applications.test.ts, "draft lifecycle".

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Applicant — name and phone are required to file
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "applicants"
  ALTER COLUMN "name"  DROP DEFAULT,
  ALTER COLUMN "name"  DROP NOT NULL,
  ALTER COLUMN "phone" DROP DEFAULT,
  ALTER COLUMN "phone" DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Property — district, survey numbers and plot area are required to file
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "property_details"
  ALTER COLUMN "district"      DROP DEFAULT,
  ALTER COLUMN "district"      DROP NOT NULL,
  ALTER COLUMN "surveyNumbers" DROP DEFAULT,
  ALTER COLUMN "surveyNumbers" DROP NOT NULL,
  ALTER COLUMN "plotAreaSqm"   DROP DEFAULT,
  ALTER COLUMN "plotAreaSqm"   DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Building — plot area and built-up area
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These two carried `DEFAULT 0` from the Phase 0 schema, before a wizard
-- existed to fill them in progressively. They have the same problem and get
-- the same treatment.
--
-- `plotAreaSqm` here is a MIRROR of property_details.plotAreaSqm, so it must be
-- able to hold the same "not answered" that the source can.
--
-- The other numeric columns on this table are deliberately left alone: 0
-- basements, 0 parking area and a 0 m setback are all real, meaningful answers,
-- so a default of 0 is correct for them.

ALTER TABLE "building_details"
  ALTER COLUMN "plotAreaSqm"    DROP DEFAULT,
  ALTER COLUMN "plotAreaSqm"    DROP NOT NULL,
  ALTER COLUMN "builtUpAreaSqm" DROP DEFAULT,
  ALTER COLUMN "builtUpAreaSqm" DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Retire the sentinels already written
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Scoped to DRAFT applications. On a SUBMITTED application these values passed
-- the submit guard and are real answers — a filed application cannot have an
-- empty district, so anything found there is data, not a placeholder, and is
-- left exactly as it is.

UPDATE "applicants" a
   SET "name"  = NULLIF(a."name", ''),
       "phone" = NULLIF(a."phone", '')
  FROM "applications" app
 WHERE app."id" = a."applicationId"
   AND app."status" = 'DRAFT';

UPDATE "property_details" p
   SET "district"      = NULLIF(p."district", ''),
       "surveyNumbers" = NULLIF(p."surveyNumbers", ''),
       "plotAreaSqm"   = NULLIF(p."plotAreaSqm", 0)
  FROM "applications" app
 WHERE app."id" = p."applicationId"
   AND app."status" = 'DRAFT';

UPDATE "building_details" b
   SET "plotAreaSqm"    = NULLIF(b."plotAreaSqm", 0),
       "builtUpAreaSqm" = NULLIF(b."builtUpAreaSqm", 0)
  FROM "applications" app
 WHERE app."id" = b."applicationId"
   AND app."status" = 'DRAFT';
