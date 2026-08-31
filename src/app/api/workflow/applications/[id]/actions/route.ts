import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getWorkflowState } from '@/server/workflow/engine';

export const dynamic = 'force-dynamic';

/**
 * THE ACTION BAR'S ONLY SOURCE.
 *
 * The screen renders exactly what this returns and invents nothing: every
 * button, its label, its destination, whether it is enabled, and the sentence
 * explaining why it is not. The POST that follows re-derives the same list from
 * the same transitions and the same guards, so a button that is offered cannot
 * be refused and a refusal cannot be a surprise.
 *
 * That is what §43's "no fake buttons" costs, and it is why this endpoint
 * exists at all rather than the UI deciding from the status.
 */
export const GET = defineRoute(async ({ user, params }) => getWorkflowState(user, params.id!), {
  capabilities: [CAPABILITIES.WORKFLOW_VIEW],
});
