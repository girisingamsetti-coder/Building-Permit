'use client';

import { useState } from 'react';
import {
  Icon3DStack,
  Icon3DSparkles,
  Icon3DActivity,
  Icon3DShieldCheck,
  Icon3DCircleSlash,
  Icon3DAlertOctagon,
  Icon3DCoins,
  Icon3DLandmark,
  Icon3DGauge,
  Icon3DHourglass,
} from '@/components/ui/icons-3d';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from './kpi-card';
import { ChartWidget } from './chart-widget';
import { ReportFilters } from './report-filters';
import { ExportButton } from './export-button';
import { OfficerPerformanceTable } from './officer-performance-table';
import type { ReportFilters as FilterParams } from '@/server/services/reports';

export function ReportsDashboard({ initialData }: { initialData: any }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  const handleFilterChange = async (filters: FilterParams) => {
    setLoading(true);
    try {
      const { fetchDashboardData } = await import('@/app/(portal)/reports/actions');
      const newData = await fetchDashboardData(filters);
      setData(newData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <ReportFilters onChange={handleFilterChange} disabled={loading} />
        <ExportButton data={data} disabled={loading} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Applications" value={data.metrics.totalApplications} icon={Layers} />
        <KpiCard title="New This Month" value={data.metrics.newThisMonth} icon={Sparkles} />
        <KpiCard title="Pending" value={data.metrics.pending} icon={Activity} />
        <KpiCard title="Approved" value={data.metrics.approved} icon={ShieldCheck} />
        <KpiCard title="Rejected" value={data.metrics.rejected} icon={CircleSlash} />
        <KpiCard title="Shortfall" value={data.metrics.shortfall} icon={AlertOctagon} />
        <KpiCard title="Fees Generated" value={`₹${data.metrics.feesGenerated.toLocaleString('en-IN')}`} icon={Coins} />
        <KpiCard title="Fees Collected" value={`₹${data.metrics.feesCollected.toLocaleString('en-IN')}`} icon={Landmark} />
        <KpiCard title="Avg Processing Time" value={`${data.metrics.averageProcessingTime} days`} icon={Gauge} />
        <KpiCard title="SLA Breach %" value={`${data.metrics.slaBreachPercent}%`} icon={Hourglass} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Application Trend (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ChartWidget type="line" data={data.trend} dataKey="count" xAxisKey="date" />
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartWidget type="pie" data={data.distribution} nameKey="name" dataKey="value" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Officer Workload</CardTitle>
        </CardHeader>
        <CardContent>
          <OfficerPerformanceTable data={data.workload} />
        </CardContent>
      </Card>
    </div>
  );
}
