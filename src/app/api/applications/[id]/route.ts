import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { saveStepSchema, type SaveStepInput } from '@/lib/schemas/applications';
import {
  deleteDraft,
  getApplication,
  getWizardState,
  saveStep,
} from '@/server/services/applications';

export const dynamic = 'force-dynamic';

/**
 * One application.
 *
 * The id in the path is treated as an untrusted string throughout: every
 * service call below takes `user` and merges the row-scope fragment into its
 * query, so an id belonging to somebody else's file resolves to "not found"
 * rather than to a 403 that confirms it exists.
 */

export const GET = defineRoute(
  async ({ user, params, searchParams }) => {
    const id = params.id!;
    // `?wizard=true` returns the step values and progress as well, so the
    // resume screen needs one request rather than two.
    return searchParams.get('wizard') === 'true'
      ? getWizardState(user, id)
      : getApplication(user, id);
  },
  { capabilities: [CAPABILITIES.APPLICATION_VIEW] }
);

/** Saves one wizard step — validated, or as an unvalidated draft. */
export const PATCH = defineRoute<SaveStepInput>(
  async ({ user, params, body, ip, userAgent, correlationId }) =>
    saveStep(user, params.id!, body, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.APPLICATION_EDIT], schema: saveStepSchema }
);

/** Soft-deletes a draft. Refused once the application has been filed. */
export const DELETE = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) =>
    deleteDraft(user, params.id!, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.APPLICATION_DELETE] }
);
