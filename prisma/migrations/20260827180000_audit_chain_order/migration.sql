-- ═══════════════════════════════════════════════════════════════════════════
-- The audit chain needs a total order, and a way to append to it safely.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two defects, found by `npm run smoke` at the close of the document and fee
-- phases, both in the Phase 0 audit service.
--
-- 1. APPENDS RACED. `audit()` read the head row and then inserted, with
--    nothing between the two steps. Two concurrent writers therefore read the
--    same head and both linked to it, so the "chain" forked. 154 rows in the
--    development database share a predecessor, and ten of them are concurrent
--    LOGIN_SUCCEEDED rows — so this happened on ordinary traffic, not only
--    under a test that deliberately parallelises. A chain that forks whenever
--    two people act at once is not tamper evidence; it is a column of hashes.
--
--    Fixed in the service, not here: appends now take a transaction-scoped
--    advisory lock, so reading the head and appending to it is one indivisible
--    step. See src/server/services/audit.ts.
--
-- 2. VERIFICATION HAD NO DEFINED ORDER. The walk was ordered by `occurredAt`,
--    a millisecond timestamp that 22 existing rows already tie on. Two rows in
--    the same millisecond can be walked in either order, so verification could
--    report a break in a chain that was intact. This migration gives the table
--    the monotonic sequence the walk actually needs.
--
-- Rows written before the fix stay exactly as they are. `audit_logs` is
-- append-only by trigger, and repairing history to make a verification pass
-- would defeat the entire purpose of keeping it.

-- ── 1. A monotonic append order ──────────────────────────────────────────

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "seq" BIGINT;

-- The backfill has to write to an append-only table. The trigger is dropped
-- for the length of this statement and restored immediately, inside the same
-- transaction the migration runs in, so there is no window in which the
-- application could edit history.
ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_append_only";

WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "occurredAt", "id") AS rn
  FROM "audit_logs"
)
UPDATE "audit_logs" a
   SET "seq" = ordered.rn
  FROM ordered
 WHERE a."id" = ordered."id"
   AND a."seq" IS NULL;

ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_append_only";

CREATE SEQUENCE IF NOT EXISTS "audit_logs_seq_seq" OWNED BY "audit_logs"."seq";
SELECT setval('audit_logs_seq_seq', COALESCE((SELECT MAX("seq") FROM "audit_logs"), 0) + 1, false);

ALTER TABLE "audit_logs" ALTER COLUMN "seq" SET DEFAULT nextval('audit_logs_seq_seq');
ALTER TABLE "audit_logs" ALTER COLUMN "seq" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "audit_logs_seq_key" ON "audit_logs" ("seq");

-- ── 2. Where the verifiable chain begins ─────────────────────────────────
--
-- Everything already in the table was written by the racing appender, so the
-- forks in it are expected and cannot be repaired. Verification therefore
-- reports on the rows written from HERE onward, and says so: an operator is
-- told "intact across N rows since the anchor", never "intact" about rows
-- nobody can vouch for.
--
-- On an empty database — a fresh deployment — this anchors at 0 and the whole
-- table is verified, which is the case that matters.

INSERT INTO "system_settings" ("id", "key", "value", "type", "group", "label", "description", "updatedAt")
SELECT
  gen_random_uuid(),
  'audit_chain_anchor_seq',
  COALESCE((SELECT MAX("seq") FROM "audit_logs"), 0)::text,
  'NUMBER'::"SettingType",
  'security',
  'Audit chain anchor',
  'Rows at or below this sequence were written before appends were serialised and may fork. Verification runs from here forward. Never edit this by hand.',
  now()
WHERE NOT EXISTS (SELECT 1 FROM "system_settings" WHERE "key" = 'audit_chain_anchor_seq');
