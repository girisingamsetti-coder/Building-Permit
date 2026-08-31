-- Correcting the constraint added minutes earlier in the same phase.
--
-- It said `(status = 'RAISED') = (notifiedAt IS NULL)` — an equivalence, which
-- asserts BOTH that a raised shortfall has not been notified AND that every
-- other state has been. The second half is false, and the integration suite
-- proved it: an applicant can see a shortfall on their application the instant
-- it is raised and answer it before the dispatcher has run, which moves the
-- status past RAISED while `notifiedAt` is still null.
--
-- The real invariant is the implication, in both useful directions but not as
-- an equivalence:
--
--   RAISED                        →  nobody has been told yet
--   NOTIFIED / ACTION_REQUIRED    →  somebody has
--
-- Everything else says nothing about notification either way, which is the
-- honest position: a shortfall answered before it was announced is a real and
-- perfectly good outcome, and the database should not refuse it.

ALTER TABLE "shortfalls" DROP CONSTRAINT IF EXISTS "shortfall_notified_has_time";

ALTER TABLE "shortfalls"
  ADD CONSTRAINT "shortfall_notified_has_time"
  CHECK (
    ("status" <> 'RAISED' OR "notifiedAt" IS NULL)
    AND ("status" NOT IN ('NOTIFIED', 'ACTION_REQUIRED') OR "notifiedAt" IS NOT NULL)
  );
