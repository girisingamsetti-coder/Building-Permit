import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function OfficerPerformanceTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return <div className="text-center p-4 text-gray-500">No workload data available.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Officer Name</TableHead>
          <TableHead className="text-right">Pending Tasks</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="font-medium">{row.officer}</TableCell>
            <TableCell className="text-right">{row.pendingTasks}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
