'use server';

import { requireAuthUser, requireCapability } from '@/server/auth/context';
import { CAPABILITIES } from '@/lib/constants';
import {
  getExecutiveDashboardMetrics,
  getApplicationTrend,
  getStatusDistribution,
  getOfficerWorkload,
  type ReportFilters
} from '@/server/services/reports';

export async function fetchDashboardData(filters: ReportFilters = {}) {
  const user = await requireAuthUser();
  requireCapability(user, CAPABILITIES.APPLICATION_VIEW); 

  const [metrics, trend, distribution, workload] = await Promise.all([
    getExecutiveDashboardMetrics(filters),
    getApplicationTrend(filters),
    getStatusDistribution(filters),
    getOfficerWorkload(filters),
  ]);

  return { metrics, trend, distribution, workload };
}
