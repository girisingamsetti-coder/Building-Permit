'use client';

import { useRouter } from 'next/navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

interface ChartWidgetProps {
  type: 'line' | 'pie';
  data: any[];
  dataKey: string;
  nameKey?: string;
  xAxisKey?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export function ChartWidget({ type, data, dataKey, nameKey, xAxisKey }: ChartWidgetProps) {
  const router = useRouter();

  const handleDrillDown = (entry: any) => {
    // Navigate to filtered applications list based on the clicked element
    let url = '/applications?';
    if (nameKey && entry[nameKey]) {
      url += `status=${entry[nameKey]}`;
    } else if (xAxisKey && entry[xAxisKey]) {
      url += `date=${entry[xAxisKey]}`;
    }
    router.push(url);
  };

  if (type === 'pie') {
    return (
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey={dataKey}
              onClick={handleDrillDown}
              className="cursor-pointer"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} onClick={(e: any) => e && e.activePayload && handleDrillDown(e.activePayload[0].payload)}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xAxisKey!} />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey={dataKey} stroke="#8884d8" activeDot={{ r: 8, cursor: 'pointer' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
