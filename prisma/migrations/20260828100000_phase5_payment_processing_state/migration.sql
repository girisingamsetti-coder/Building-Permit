-- Phase 5 — the PROCESSING payment state.
--
-- Alone in its own migration on purpose. Postgres refuses to USE a new enum
-- value in the same transaction that added it ("unsafe use of new value of
-- enum type"), and the migration that follows puts PROCESSING inside a partial
-- index predicate. Splitting them is the supported way to do this; the
-- alternative is a text cast that quietly weakens the index.
--
-- PENDING means "handed to the gateway, nobody has paid". PROCESSING means
-- "the payer is at the gateway now". They are kept apart because they fail
-- differently — see the enum comment in schema.prisma.

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PROCESSING' AFTER 'PENDING';
