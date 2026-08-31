-- Phase 5 — payments.
--
-- Additive. `payments`, `payment_transactions`, `payment_webhook_events` and
-- `payment_receipts` were all created by the Phase 0 init migration and are NOT
-- rebuilt here. This adds the columns an attempt needs, and — the part that
-- matters — the constraints that make the three payment security rules
-- properties of the database rather than promises about the service:
--
--   §5.1  never trust the frontend      → payment_success_is_locked
--   §5.2  verify server-side            → payment_success_is_locked
--   §5.3  duplicate callbacks are free  → payment_webhook_events unique key
--                                         (already present) + one open attempt
--
-- See docs/07-subsystems.md O.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. An attempt's own columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "payments"
  ADD COLUMN "applicationId"   UUID,
  ADD COLUMN "attemptNo"       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "providerOrderId" TEXT    NOT NULL DEFAULT '',
  ADD COLUMN "gatewayTxnId"    TEXT,
  ADD COLUMN "bankRef"         TEXT    NOT NULL DEFAULT '',
  ADD COLUMN "method"          TEXT    NOT NULL DEFAULT '',
  ADD COLUMN "expiresAt"       TIMESTAMP(3),
  ADD COLUMN "lastVerifiedAt"  TIMESTAMP(3),
  ADD COLUMN "verifyAttempts"  INTEGER NOT NULL DEFAULT 0;

-- Backfill before the NOT NULL. A demand never moves between applications, so
-- the copy cannot drift from the join it came from.
UPDATE "payments" p
   SET "applicationId" = f."applicationId"
  FROM "application_fees" f
 WHERE f.id = p."applicationFeeId";

ALTER TABLE "payments" ALTER COLUMN "applicationId" SET NOT NULL;

-- RESTRICT, deliberately: an application that has taken money is not
-- deletable. Draft deletion is already soft (`applications.deletedAt`) and a
-- draft cannot have reached a demand, so nothing legitimate is blocked.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "payments_applicationId_initiatedAt_idx"
  ON "payments" ("applicationId", "initiatedAt");

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. One open attempt per demand
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The idempotency guarantee of §5.3, expressed where it cannot be forgotten.
-- Two browser tabs both pressing Pay produce one payment row: the second
-- INSERT hits this index and the service reuses the attempt that already
-- exists. Without it, a demand could carry two live payment windows and be
-- paid twice before either settled.
--
-- Settled attempts are excluded, so a retry after a failure is free.

CREATE UNIQUE INDEX IF NOT EXISTS "payment_one_open_per_demand"
  ON "payments" ("applicationFeeId")
  WHERE status IN ('INITIATED', 'PENDING', 'PROCESSING');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A success is only ever a SETTLED success
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `settlementLockAt` is stamped inside the settlement transaction, after
-- `provider.verify()` has answered and while the row is held FOR UPDATE. This
-- constraint says a row cannot claim SUCCESS without having been through that.
--
-- It is the database's half of "never trust the frontend": no code path, and
-- no hand-written UPDATE, can mark a payment successful on the strength of a
-- browser redirect, because the redirect does not set this column.

ALTER TABLE "payments"
  ADD CONSTRAINT "payment_success_is_locked"
  CHECK (status <> 'SUCCESS' OR "settlementLockAt" IS NOT NULL);

-- A settled payment has a settlement time. Catches the half-written row.
ALTER TABLE "payments"
  ADD CONSTRAINT "payment_success_is_dated"
  CHECK (status <> 'SUCCESS' OR "settledAt" IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The gateway ledger
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `payment_transactions` is already append-only (a trigger from the
-- constraints migration). This pins the vocabulary of `direction` so a typo
-- becomes a failed insert rather than a row nobody's filter ever matches.

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_txn_direction"
  CHECK (direction IN ('INITIATE', 'RETURN', 'WEBHOOK', 'VERIFY', 'RECONCILE', 'CANCEL', 'TIMEOUT'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Callbacks
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `@@unique(provider, externalId)` already exists and is what makes a repeated
-- delivery a no-op. These two columns are for the events that arrive and
-- CANNOT be placed: an unrecognised event type, or a paymentRef we have never
-- issued. Recording both is what makes such an event investigable instead of a
-- line in a log file.

ALTER TABLE "payment_webhook_events"
  ADD COLUMN "eventType"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN "paymentRef" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "payment_webhook_events_paymentRef_idx"
  ON "payment_webhook_events" ("paymentRef");

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Receipts are not editable
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Not fully append-only: `storageKey` must be re-pointable, because the
-- rendered artefact is regenerated if the stored object is ever lost, and a
-- permanently broken download link would be worse than a re-render.
--
-- Everything that makes the receipt a RECEIPT — its number, the amount, the
-- payment it belongs to, the frozen snapshot of payer and line items, the date
-- it was issued — cannot change, and the row cannot be deleted. A receipt has
-- been given to a citizen; a later fee revision must never alter it.

CREATE OR REPLACE FUNCTION lams_receipt_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment_receipts: a receipt cannot be deleted'
      USING HINT = 'A receipt already given to a citizen is part of the record.',
            ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."receiptNumber" IS DISTINCT FROM OLD."receiptNumber"
     OR NEW."paymentId"  IS DISTINCT FROM OLD."paymentId"
     OR NEW.amount       IS DISTINCT FROM OLD.amount
     OR NEW."issuedAt"   IS DISTINCT FROM OLD."issuedAt"
     OR NEW.snapshot     IS DISTINCT FROM OLD.snapshot
  THEN
    RAISE EXCEPTION 'payment_receipts: only storageKey may be updated'
      USING HINT = 'Correct a receipt by refunding and re-issuing, never by editing it.',
            ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_receipts_immutable ON payment_receipts;

CREATE TRIGGER payment_receipts_immutable
  BEFORE UPDATE OR DELETE ON payment_receipts
  FOR EACH ROW EXECUTE FUNCTION lams_receipt_immutable();

CREATE INDEX IF NOT EXISTS "payment_receipts_issuedAt_idx"
  ON "payment_receipts" ("issuedAt");
