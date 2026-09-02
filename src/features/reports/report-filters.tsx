'use client';

import { useState } from 'react';
import type { ReportFilters as FilterParams } from '@/server/services/reports';
import { Button } from '@/components/ui/button';

interface ReportFiltersProps {
  onChange: (filters: FilterParams) => void;
  disabled?: boolean;
}

export function ReportFilters({ onChange, disabled }: ReportFiltersProps) {
  const [filters, setFilters] = useState<FilterParams>({});

  const handleApply = () => {
    onChange(filters);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <input 
        type="date" 
        className="px-3 py-2 border rounded-md text-sm"
        onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value ? new Date(e.target.value) : undefined })}
        disabled={disabled}
      />
      <span className="text-sm text-gray-500">to</span>
      <input 
        type="date" 
        className="px-3 py-2 border rounded-md text-sm"
        onChange={(e) => setFilters({ ...filters, dateTo: e.target.value ? new Date(e.target.value) : undefined })}
        disabled={disabled}
      />
      <select 
        className="px-3 py-2 border rounded-md text-sm bg-white"
        onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
        disabled={disabled}
      >
        <option value="">All Statuses</option>
        <option value="DRAFT">Draft</option>
        <option value="SUBMITTED">Submitted</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>
      <Button onClick={handleApply} disabled={disabled} size="sm">
        Apply Filters
      </Button>
    </div>
  );
}
