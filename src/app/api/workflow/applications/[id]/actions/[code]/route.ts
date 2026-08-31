import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { performActionSchema, type PerformActionInput } from '@/lib/schemas/workflow';
import { performAction } from '@/server/workflow/engine';

export const dynamic = 'force-dynamic';

/**
 * Performing one workflow action.
 *
 * The route requires only WORKFLOW_VIEW. The capability that actually matters
 * is derived PER ACTION inside the engine, from `workflow_actions.capabilityKey`
 * — because which capability an action needs is configuration, and a list of
 * capabilities on this route would be a second copy of it that could drift.
 * A caller holding WORKFLOW_VIEW and nothing else can reach this handler and
 * will be refused by the engine, which is the correct place for the refusal:
 * it is the only place that knows what was asked for.
 */
export const POST = defineRoute<PerformActionInput>(
  async ({ user, params, body, ip, userAgent, correlationId }) =>
    performAction(user, params.id!, params.code!, body, { ip, userAgent, correlationId }),
  {
    capabilities: [CAPABILITIES.WORKFLOW_VIEW],
    schema: performActionSchema,
  }
);
