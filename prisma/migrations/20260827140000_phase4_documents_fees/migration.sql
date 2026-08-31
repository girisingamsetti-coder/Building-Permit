-- Phase 4 — documents and the fee engine.
--
-- Additive. `document_types`, `document_requirements`, `application_documents`,
-- `document_versions`, `fee_structures`, `fee_components`, `fee_slabs`,
-- `application_fees` and `fee_line_items` were all created by the Phase 0 init
-- migration and are NOT rebuilt here. This adds `fee_rules`, the columns the
-- Phase 4 services and UI need, and the constraints that make the money
-- arithmetic and the one-live-demand rule properties of the database rather
-- than promises about the code.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Document types — the second half of the upload gate
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `allowedMime` already existed. The pipeline checks extension and sniffed
-- MIME as two INDEPENDENT gates (docs P.3), so the extension list is stored
-- rather than derived from the MIME list: deriving one from the other would
-- collapse two checks into one and weaken both.

ALTER TABLE "document_types"
  ADD COLUMN "allowedExtensions" TEXT[] NOT NULL DEFAULT ARRAY['pdf']::TEXT[];

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Document requirements — configurable by building and property type
-- ═══════════════════════════════════════════════════════════════════════════
--
-- §4 asks for the required-document list to be configurable by application
-- type, building type, property type and other conditions. Application type
-- was already a column and "other conditions" was already the JSON predicate;
-- these two add the middle pair.
--
-- Plain TEXT columns rather than two more keys inside `condition`, because
-- these are the axes a department actually configures: a column can be
-- filtered, indexed, and rendered as a dropdown in the admin UI, and a
-- misspelt one is visible rather than silently never matching. Empty = "any",
-- which is what makes an existing row keep applying to everything.

ALTER TABLE "document_requirements"
  ADD COLUMN "buildingUse" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "landUseZone" TEXT NOT NULL DEFAULT '';

-- "Which requirements mention this document type?" — the admin catalogue's
-- own question, and the one asked before a type may be deactivated.
CREATE INDEX IF NOT EXISTS "document_requirements_documentTypeId_idx"
  ON "document_requirements" ("documentTypeId");

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Fee rules — conditional rebates and surcharges
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deliberately a separate table from `fee_components` rather than a sixth
-- CalculationBasis. A component answers "what is charged"; a rule answers
-- "what happens to the charge in this case". Keeping them apart is what lets
-- a demand print a Subtotal and an Adjustments line, instead of one number
-- that quietly already had a concession folded into it — which is exactly the
-- number an applicant cannot check and an officer cannot defend.

CREATE TYPE "FeeAdjustmentKind" AS ENUM ('REBATE', 'SURCHARGE');

CREATE TABLE "fee_rules" (
  "id"             UUID NOT NULL,
  "feeStructureId" UUID NOT NULL,
  "code"           TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "kind"           "FeeAdjustmentKind" NOT NULL,
  "basis"          "CalculationBasis" NOT NULL DEFAULT 'PERCENTAGE',
  "rate"           DECIMAL(18,4),
  "appliesToCode"  TEXT NOT NULL DEFAULT '',
  "minAmount"      DECIMAL(18,2),
  "maxAmount"      DECIMAL(18,2),
  "condition"      JSONB NOT NULL DEFAULT '{}',
  "reason"         TEXT NOT NULL DEFAULT '',
  "displayOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "fee_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_rules_feeStructureId_code_key"
  ON "fee_rules" ("feeStructureId", "code");

ALTER TABLE "fee_rules"
  ADD CONSTRAINT "fee_rules_feeStructureId_fkey"
  FOREIGN KEY ("feeStructureId") REFERENCES "fee_structures" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- An adjustment can only be a fixed amount or a percentage. The other bases
-- (per-unit-area, slab, formula) describe a CHARGE and have no meaning here;
-- refusing them in the database means a misconfigured structure cannot be
-- saved at all, rather than failing at the moment a demand is raised.
ALTER TABLE "fee_rules"
  ADD CONSTRAINT "fee_rule_basis_supported"
  CHECK ("basis" IN ('FLAT', 'PERCENTAGE'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The demand — what it must remember about how it was calculated
-- ═══════════════════════════════════════════════════════════════════════════
--
-- §9: if the fee structure changes later, an old application must keep the
-- calculation that applied when its demand was generated.
--
-- The structure id and version were already recorded. These three complete
-- the picture, and each is COPIED rather than joined, because the row it would
-- otherwise join to is one an administrator may legitimately edit years later:
--
--   feeStructureCode  which schedule, by name, even if it is renamed
--   roundingRule      the rounding in force then, even if it is changed
--   generatedById     who issued the demand
--
-- Together with the frozen `calculationInputs` and the line-item snapshots,
-- a demand from March is still fully explainable in November after two rate
-- revisions — without re-running anything.

ALTER TABLE "application_fees"
  ADD COLUMN "feeStructureCode" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "roundingRule"     TEXT NOT NULL DEFAULT 'NEAREST_1',
  ADD COLUMN "adjustmentTotal"  DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "generatedById"    UUID;

-- The demand's arithmetic must hold. Subtotal is the sum of the component
-- lines, adjustmentTotal the sum of the rebate/surcharge lines (signed), and
-- the total is exactly their sum — never a separately-stored number that could
-- drift from the breakdown printed beneath it.
ALTER TABLE "application_fees"
  ADD CONSTRAINT "total_is_subtotal_plus_adjustments"
  CHECK ("totalAmount" = "subtotal" + "adjustmentTotal");

-- A rebate can reduce a demand to nothing, but never below it.
ALTER TABLE "application_fees"
  ADD CONSTRAINT "subtotal_non_negative" CHECK ("subtotal" >= 0);

-- At most ONE live ORIGINAL demand per application.
--
-- The service already refuses to generate a second one, but two officers
-- pressing Generate in the same second would both pass that check. This is the
-- guard that cannot be raced. CANCELLED and WAIVED demands are excluded, so a
-- demand raised in error can be cancelled and re-issued.
CREATE UNIQUE INDEX IF NOT EXISTS "one_live_original_demand"
  ON "application_fees" ("applicationId")
  WHERE "type" = 'ORIGINAL'
    AND "status" IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Line items — components and adjustments in one table
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "fee_line_items"
  ADD COLUMN "kind"      TEXT NOT NULL DEFAULT 'COMPONENT',
  ADD COLUMN "feeRuleId" UUID;

ALTER TABLE "fee_line_items"
  ADD CONSTRAINT "fee_line_items_feeRuleId_fkey"
  FOREIGN KEY ("feeRuleId") REFERENCES "fee_rules" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The Phase 0 constraint required every line to be non-negative, which was
-- right when every line was a charge. A rebate line is negative BY DESIGN —
-- that is how it appears in the breakdown as a deduction rather than as an
-- invisible reduction of another line. So the rule is refined rather than
-- dropped: a CHARGE still cannot be negative.
ALTER TABLE "fee_line_items" DROP CONSTRAINT IF EXISTS "amount_non_negative";

ALTER TABLE "fee_line_items"
  ADD CONSTRAINT "charge_lines_non_negative"
  CHECK ("kind" <> 'COMPONENT' OR "amount" >= 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Hot predicates for the Phase 4 read paths
-- ═══════════════════════════════════════════════════════════════════════════

-- The document checklist: every requirement for one application type, in
-- display order, active only.
CREATE INDEX IF NOT EXISTS "document_requirements_active_order"
  ON "document_requirements" ("applicationTypeId", "displayOrder")
  WHERE "isActive";

-- "Which structure applies to this type on this date?" — the effective-dated
-- resolution every demand starts with.
CREATE INDEX IF NOT EXISTS "fee_structures_effective"
  ON "fee_structures" ("applicationTypeId", "effectiveFrom" DESC)
  WHERE "isActive";

-- The demand list on the Fees tab, newest first.
CREATE INDEX IF NOT EXISTS "application_fees_by_application"
  ON "application_fees" ("applicationId", "createdAt" DESC);
