-- Constraints Prisma cannot express.
--
-- Several of these turn a convention into an impossibility, which is the
-- point: a rule enforced only by application code is a rule that survives
-- exactly as long as everyone remembers it.
--
-- See docs/02-data-model.md E.1.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Exactly one active version per drawing / document
-- ═══════════════════════════════════════════════════════════════════════════
-- "Two current versions" becomes impossible rather than merely avoided.

CREATE UNIQUE INDEX IF NOT EXISTS drawing_one_active
  ON drawing_versions ("drawingId")
  WHERE "isActive";

CREATE UNIQUE INDEX IF NOT EXISTS document_one_active
  ON document_versions ("applicationDocumentId")
  WHERE "isActive";

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Financial integrity
-- ═══════════════════════════════════════════════════════════════════════════

-- A demand can never be over-paid.
ALTER TABLE application_fees
  ADD CONSTRAINT paid_not_over_total CHECK ("paidAmount" <= "totalAmount");

-- Money is never negative.
ALTER TABLE fee_line_items ADD CONSTRAINT amount_non_negative CHECK (amount >= 0);
ALTER TABLE application_fees ADD CONSTRAINT total_non_negative CHECK ("totalAmount" >= 0);
ALTER TABLE payments ADD CONSTRAINT payment_positive CHECK (amount > 0);
ALTER TABLE refunds ADD CONSTRAINT refund_positive CHECK (amount > 0);

-- A slab band must not be inverted.
ALTER TABLE fee_slabs
  ADD CONSTRAINT slab_band_ordered CHECK ("toValue" IS NULL OR "toValue" > "fromValue");

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Workflow integrity
-- ═══════════════════════════════════════════════════════════════════════════

-- One live workflow instance per application.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_instance
  ON workflow_instances ("applicationId")
  WHERE status IN ('ACTIVE', 'PARKED');

-- One open task per instance. Makes a duplicate open task impossible rather
-- than merely unlikely — the concurrency guard of last resort.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_task
  ON workflow_tasks ("instanceId")
  WHERE status IN ('PENDING', 'IN_PROGRESS');

-- The hot officer-queue predicate.
CREATE INDEX IF NOT EXISTS open_tasks_by_role
  ON workflow_tasks ("assignedRoleKey", "receivedAt")
  WHERE status IN ('PENDING', 'IN_PROGRESS');

-- The approval guard's predicate: any open shortfall, any kind, any mode.
-- See docs/03-workflow.md F.5.1.
CREATE INDEX IF NOT EXISTS open_shortfalls_by_application
  ON shortfalls ("applicationId")
  WHERE status IN ('OPEN', 'RESPONDED', 'UNDER_REVIEW');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Append-only enforcement
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The requirement is that audit history is not editable. An ORM convention is
-- not enforcement, so this is done in the database.
--
-- A trigger is used rather than REVOKE because it applies to the table OWNER
-- as well — REVOKE does not, and in most deployments the application connects
-- as the owner. In a hardened deployment with a separate application role,
-- ALSO run:
--
--   REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs           FROM lams_app;
--   REVOKE UPDATE, DELETE, TRUNCATE ON workflow_history     FROM lams_app;
--   REVOKE UPDATE, DELETE, TRUNCATE ON payment_transactions FROM lams_app;
--
-- TRUNCATE is deliberately NOT blocked, so `prisma migrate reset` still works
-- in development and CI. DROP is DDL and is unaffected either way.

CREATE OR REPLACE FUNCTION lams_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only: % is not permitted on this table', TG_TABLE_NAME, TG_OP
    USING HINT = 'Corrections are recorded as new rows, never by editing history.',
          ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION lams_prevent_mutation();

CREATE TRIGGER workflow_history_append_only
  BEFORE UPDATE OR DELETE ON workflow_history
  FOR EACH ROW EXECUTE FUNCTION lams_prevent_mutation();

CREATE TRIGGER payment_transactions_append_only
  BEFORE UPDATE OR DELETE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION lams_prevent_mutation();
