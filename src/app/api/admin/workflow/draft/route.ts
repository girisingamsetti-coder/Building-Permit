import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listWorkflows, getDraft, getPublished, listWorkflowActions, createDraft } from '@/server/services/workflow-admin';

export const dynamic = 'force-dynamic';

const schema = z.object({ code: z.string().min(1) });

export const GET = defineRoute(
  async ({ searchParams }) => {
    const code = searchParams.get('code');
    if (code) {
      const [draft, published, actions] = await Promise.all([
        getDraft(code),
        getPublished(code),
        listWorkflowActions(),
      ]);
      return { draft, published, actions };
    }
    return listWorkflows();
  },
  { capabilities: [CAPABILITIES.WORKFLOW_MANAGE] }
);

export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) =>
    createDraft(body.code, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.WORKFLOW_MANAGE], schema }
);
