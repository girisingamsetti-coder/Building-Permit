import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { getApplicationMeta } from '@/server/services/applications';

export const dynamic = 'force-dynamic';

/**
 * Reference data the wizard and the list filters need: application types,
 * zones, and the administrator-extensible master lists (land use, occupancy,
 * structure type, tenure).
 *
 * One request rather than four, because the form needs all of them at once.
 */
export const GET = defineRoute(async () => getApplicationMeta(), {
  capabilities: [CAPABILITIES.APPLICATION_VIEW],
});
