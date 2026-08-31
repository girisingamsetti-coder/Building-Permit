-- ═══════════════════════════════════════════════════════════════════════════
-- Move the audit anchor to where the row hash became reproducible.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The previous migration serialised appends and gave the chain a total order.
-- Verifying the rows it anchored then exposed the OTHER half of the defect,
-- which serialising could not have shown on its own:
--
--   `before` and `after` are jsonb. A value handed to `audit()` as a Date was
--   hashed AS A DATE — `canonical()` renders one as a bare ISO instant — and
--   came back from the database as a string, which it renders quoted. The
--   recomputed hash therefore differed from the stored hash by two quote
--   characters, and the row could never be verified again.
--
-- That is not an exotic shape. `submittedAt`, `verifiedAt`, `issuedAt`,
-- `expiresOn` and `dueDate` all reach audit payloads as Dates, so a large
-- share of rows reported as tampered with. A tamper-evidence mechanism that
-- cries wolf on ordinary rows is worse than none: the real signal cannot be
-- picked out of the noise.
--
-- Fixed in src/server/services/audit.ts — payloads are now normalised to the
-- representation the database will store, before the hash is taken.
--
-- Rows written before that fix keep their unreproducible hashes. `audit_logs`
-- is append-only, and rewriting history so a verification passes is precisely
-- what this table exists to prevent. The anchor moves instead, so verification
-- reports on the rows it can actually vouch for and says which those are.

UPDATE "system_settings"
   SET "value" = COALESCE((SELECT MAX("seq") FROM "audit_logs"), 0)::text,
       "updatedAt" = now()
 WHERE "key" = 'audit_chain_anchor_seq';
