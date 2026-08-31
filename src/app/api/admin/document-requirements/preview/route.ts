import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { previewCondition } from '@/server/services/document-admin';

export const dynamic = 'force-dynamic';

/**
 * Checks a condition and returns the sentence it produces, without saving it.
 *
 * The editor calls this as the administrator types, so a rule is read back in
 * the words an APPLICANT will see — "the number of floors is at least 4" —
 * before it is stored. A rule nobody can read is a rule nobody can review, and
 * a rule that cannot be evaluated is never asked for at all.
 *
 * A preview writes nothing, so it is deliberately not blocked for the
 * read-only role: an auditor may want to understand a rule without being able
 * to change one.
 */
const previewSchema = z.object({
  condition: z.string().trim().max(4000).optional().default(''),
});

export const POST = defineRoute<z.infer<typeof previewSchema>>(
  async ({ body }) => {
    if (!body.condition || body.condition === '{}') {
      return { valid: true, problems: [], explanation: '', always: true };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body.condition);
    } catch {
      return {
        valid: false,
        problems: [
          {
            path: 'condition',
            message: 'That is not valid JSON. A rule that always applies is written as {}.',
          },
        ],
        explanation: '',
        always: false,
      };
    }

    return { ...previewCondition(parsed), always: false };
  },
  {
    capabilities: [CAPABILITIES.MASTER_DATA_MANAGE],
    schema: previewSchema,
    blockReadOnly: false,
  }
);
