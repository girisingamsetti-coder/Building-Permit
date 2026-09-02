import type { Metadata } from 'next';
import { requirePageUser } from '@/server/auth/page-guard';
import { ReportsDashboard } from '@/features/reports/reports-dashboard';
import { fetchDashboardData } from './actions';
import { ReportsErrorBoundary } from '@/features/reports/error-boundary';

export const metadata: Metadata = { title: 'Reports & Analytics' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  try {
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
        <ReportsErrorBoundary>
          <ReportsDashboard initialData={data} />
        </ReportsErrorBoundary>
      </div>
    );
  } catch (error: any) {
    return (
      <div className="p-8">
        <h1 className="text-red-500 font-bold text-2xl mb-4">Server Error Debug</h1>
        <pre className="bg-red-50 p-4 border border-red-200 rounded text-red-900 whitespace-pre-wrap">
          {error?.message || String(error)}
          {'\n\n'}
          {error?.stack}
        </pre>
      </div>
    );
  }
}
