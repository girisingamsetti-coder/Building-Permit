-- Phase 2 — LTP application management.
--
-- Additive over the Phase 1 schema. `applications`, `application_types`,
-- `applicants`, `property_details` and `building_details` already exist and
-- are NOT rebuilt here; this migration adds the two tables the filing wizard
-- and the timeline need, the LTP declaration columns, and it relaxes three
-- NOT NULLs so a draft may legitimately be partial.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LTP declaration on the application header
-- ═══════════════════════════════════════════════════════════════════════════
-- A snapshot, not a lookup: an LTP's licence may lapse or change class after
-- filing, and the record must show what was true at the time.

ALTER TABLE "applications"
  ADD COLUMN "ltpDeclaredAt"  TIMESTAMP(3),
  ADD COLUMN "ltpDeclaration" JSONB NOT NULL DEFAULT '{}';

-- The commonest query in the product: an LTP's own files, most recently
-- touched first. Without this it sorts on a heap.
CREATE INDEX IF NOT EXISTS "applications_ltpUserId_deletedAt_updatedAt_idx"
  ON "applications" ("ltpUserId", "deletedAt", "updatedAt");

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A draft may be partial
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The filing wizard builds `applicants` and `property_details` one step at a
-- time, so the row exists before every mandatory value has been supplied. A
-- DRAFT is incomplete by definition and the database should not pretend
-- otherwise. Completeness is enforced at SUBMIT, by the same step schemas the
-- wizard validates with — the moment where it actually carries meaning.
--
-- Nothing is widened: these stay NOT NULL, they merely gain a default.

ALTER TABLE "applicants"
  ALTER COLUMN "name"  SET DEFAULT '',
  ALTER COLUMN "phone" SET DEFAULT '';

ALTER TABLE "property_details"
  ALTER COLUMN "district"      SET DEFAULT '',
  ALTER COLUMN "surveyNumbers" SET DEFAULT '',
  ALTER COLUMN "plotAreaSqm"   SET DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Wizard state
-- ═══════════════════════════════════════════════════════════════════════════
-- Interface state, not statutory record. Cascades away with the application.

CREATE TABLE "application_drafts" (
  "id"             UUID         NOT NULL,
  "applicationId"  UUID         NOT NULL,
  "currentStep"    INTEGER      NOT NULL DEFAULT 0,
  "completedSteps" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "scratch"        JSONB        NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "application_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "application_drafts_applicationId_key"
  ON "application_drafts" ("applicationId");

ALTER TABLE "application_drafts"
  ADD CONSTRAINT "application_drafts_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The wizard has a fixed number of steps; a step index outside it is a bug,
-- not data. Ten steps today (0..9) with headroom, so adding one is a schema
-- change rather than a silent out-of-range write.
ALTER TABLE "application_drafts"
  ADD CONSTRAINT "draft_step_in_range" CHECK ("currentStep" >= 0 AND "currentStep" < 32);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Application timeline
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The human-readable narrative of a file, distinct from `audit_logs`. The
-- audit trail is hash-chained tamper evidence recording before/after state for
-- an auditor; this is the story an applicant and an officer read on the
-- application page.
--
-- Phase 7 appends workflow events to this same table.

CREATE TABLE "application_events" (
  "id"            UUID         NOT NULL,
  "applicationId" UUID         NOT NULL,
  "sequence"      INTEGER      NOT NULL,
  "type"          TEXT         NOT NULL,
  "title"         TEXT         NOT NULL,
  "description"   TEXT         NOT NULL DEFAULT '',
  "actorId"       UUID,
  "actorName"     TEXT         NOT NULL DEFAULT '',
  "actorRoleKey"  TEXT         NOT NULL DEFAULT '',
  "metadata"      JSONB        NOT NULL DEFAULT '{}',
  "occurredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- Gap-free per application. The unique index is what makes a concurrent
-- double-append fail loudly instead of silently reusing a sequence number.
CREATE UNIQUE INDEX "application_events_applicationId_sequence_key"
  ON "application_events" ("applicationId", "sequence");

CREATE INDEX "application_events_applicationId_occurredAt_idx"
  ON "application_events" ("applicationId", "occurredAt");

ALTER TABLE "application_events"
  ADD CONSTRAINT "application_events_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Not editable, using the function the Phase 1 constraints migration
-- installed. A timeline that can be rewritten is a timeline nobody can rely on.
--
-- UPDATE only, deliberately. The FK above is ON DELETE CASCADE, and a row-level
-- DELETE trigger would make deleting the parent application impossible — the
-- cascade would trip the trigger. An application is soft-deleted in normal
-- operation (deletedAt), so the only DELETEs that reach here are the cascade
-- from a genuine hard delete, where removing the timeline with its application
-- is the correct outcome. Rewriting an event in place never is.
CREATE TRIGGER application_events_no_update
  BEFORE UPDATE ON "application_events"
  FOR EACH ROW EXECUTE FUNCTION lams_prevent_mutation();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Number sequence: allocate atomically
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The application number generator calls this. Doing the read-modify-write in
-- ONE statement inside the caller's transaction is what makes two concurrent
-- filings impossible to give the same number: the second waits on the row lock
-- the first already holds, and the `applications.applicationNumber` UNIQUE
-- index is the backstop if this is ever bypassed.
--
-- Gap-free: the allocation commits with the application row or not at all.

CREATE OR REPLACE FUNCTION lams_next_sequence(p_scope TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO number_sequences (id, scope, current, "updatedAt")
  VALUES (gen_random_uuid(), p_scope, 1, NOW())
  ON CONFLICT (scope) DO UPDATE
    SET current = number_sequences.current + 1,
        "updatedAt" = NOW()
  RETURNING current INTO v_next;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql;
