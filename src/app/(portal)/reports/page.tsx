import type { Metadata } from 'next';
import { requirePageUser } from '@/server/auth/page-guard';
import { ReportsDashboard } from '@/features/reports/reports-dashboard';
import { fetchDashboardData } from './actions';

export const metadata: Metadata = { title: 'Reports & Analytics' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  await requirePageUser();
  const data = await fetchDashboardData();
  
  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Comprehensive executive metrics, trends, and officer workloads.</p>
        </div>
      </div>
      <ReportsDashboard initialData={data} />
    </div>
  );
}
