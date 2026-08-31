import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { previewFee } from '@/server/services/fees';

export const dynamic = 'force-dynamic';

/**
 * What the demand WOULD be. PERSISTS NOTHING.
 *
 * A POST because it is a computation with a body-shaped future (Phase 5 will
 * let Finance preview against a chosen structure version), not because it
 * changes anything. FEE_VIEW rather than FEE_GENERATE is the right capability
 * for the same reason: an applicant is entitled to know the cost before
 * anybody raises an irreversible demand against them.
 *
 * `blockReadOnly` is switched off precisely because this writes nothing — the
 * auditor's read-only account can see a preview like any other reader, and
 * refusing it would be the wrapper protecting against a write that does not
 * happen.
 */
export const POST = defineRoute(async ({ user, params }) => previewFee(user, params.id!), {
  capabilities: [CAPABILITIES.FEE_VIEW],
  blockReadOnly: false,
});
