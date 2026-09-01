import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page-header';

export default function TasksLoading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" />
      
      {/* Table Controls */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      
      {/* Table Skeleton */}
      <div className="rounded-md border bg-white">
        <div className="border-b px-4 py-3">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/12" />
          </div>
        </div>
        
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-4 flex items-center justify-between">
            <div className="space-y-2 w-1/4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="w-1/4">
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="w-1/4">
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="w-1/12 flex justify-end">
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
