import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { settingsBatchSchema, type SettingsBatchInput } from '@/lib/schemas/settings';
import { listSettings, updateSettings } from '@/server/services/settings';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(async () => listSettings(), {
  capabilities: [CAPABILITIES.SETTINGS_MANAGE],
});

export const PATCH = defineRoute<SettingsBatchInput>(
  async ({ body, user, ip, userAgent, correlationId }) =>
    updateSettings(body.changes, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.SETTINGS_MANAGE], schema: settingsBatchSchema }
);
