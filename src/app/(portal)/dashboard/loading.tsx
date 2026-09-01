import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page-header';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      
      <div className="space-y-4">
        {/* KPI Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        
        {/* Main Content Area */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-[500px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
