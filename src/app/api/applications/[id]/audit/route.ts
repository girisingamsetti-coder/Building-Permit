import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { assertApplicationAccess } from '@/server/auth/scope';
import { applicationAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

/**
 * The tamper-evident record for one application.
 *
 * AUDIT_VIEW, which every departmental role holds and the LTP holds for their
 * own files — an applicant is entitled to see what was done to their
 * application and by whom. Row scope is asserted first, so the capability
 * alone never opens somebody else's file.
 */
export const GET = defineRoute(
  async ({ user, params }) => {
    await assertApplicationAccess(user, params.id!);
    return applicationAudit(params.id!);
  },
  { capabilities: [CAPABILITIES.AUDIT_VIEW] }
);
