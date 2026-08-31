import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { reassignTaskSchema, type ReassignTaskInput } from '@/lib/schemas/workflow';
import { reassignTask, reassignCandidates } from '@/server/workflow/tasks';

export const dynamic = 'force-dynamic';

/** Who this task could be given to, with each officer's current load. */
export const GET = defineRoute(async ({ user, params }) => reassignCandidates(user, params.id!), {
  capabilities: [CAPABILITIES.WORKFLOW_REASSIGN],
});

/**
 * Move a file to a named officer.
 *
 * The target must hold a role that works at the file's CURRENT stage —
 * reassigning a Commissioner's file to a TPA would put it in an inbox where
 * nobody can act on it, and the file would simply stop.
 */
export const POST = defineRoute<ReassignTaskInput>(
  async ({ user, params, body, ip, userAgent, correlationId }) =>
    reassignTask(user, params.id!, body, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_REASSIGN], schema: reassignTaskSchema }
);
