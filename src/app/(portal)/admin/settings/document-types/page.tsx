import type { Metadata } from 'next';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { prisma } from '@/server/db/prisma';
import { listDocumentRequirements, listDocumentTypes } from '@/server/services/document-admin';
import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DocumentTypesPanel,
  type DocumentTypeRow,
} from '@/features/admin/document-types-panel';
import {
  DocumentRulesPanel,
  type RuleRow,
  type RuleMeta,
} from '@/features/admin/document-rules-panel';

export const metadata: Metadata = { title: 'Documents — configuration' };
export const dynamic = 'force-dynamic';

/**
 * The document catalogue and its requirement rules.
 *
 * This screen is the one that makes a claim made everywhere else in the
 * documentation true: no document list is hard-coded, so a department changes
 * a threshold — four floors to three — without a migration or a deploy.
 * `resolveRequirements()` reads these rows and nothing else. Until this page
 * existed, exercising that meant editing the database by hand.
 */
export default async function DocumentConfigurationPage() {
  await requirePageCapability(CAPABILITIES.MASTER_DATA_MANAGE);

  const [types, rules, applicationTypes] = await Promise.all([
    listDocumentTypes({ includeArchived: true }),
    listDocumentRequirements(),
    prisma.applicationType.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const live = types.filter((t) => !t.deletedAt);
  const activeRules = rules.filter((r) => r.isActive).length;

  const meta: RuleMeta = {
    documentTypes: live.map((t) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      isActive: t.isActive,
    })),
    applicationTypes,
  };

  return (
    <>
      <PageHeader
        title="Documents"
        description={`${live.length} document ${live.length === 1 ? 'type' : 'types'} and ${activeRules} active ${activeRules === 1 ? 'rule' : 'rules'}. Together these derive the checklist on every application.`}
      />

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Requirement rules</TabsTrigger>
          <TabsTrigger value="types">Document types</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="pt-4">
          <DocumentRulesPanel rules={rules as unknown as RuleRow[]} meta={meta} />
        </TabsContent>

        <TabsContent value="types" className="pt-4">
          <DocumentTypesPanel types={types as unknown as DocumentTypeRow[]} />
        </TabsContent>
      </Tabs>
    </>
  );
}
