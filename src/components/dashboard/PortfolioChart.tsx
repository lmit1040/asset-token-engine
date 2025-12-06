import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { AssetType, ASSET_TYPE_LABELS } from '@/types/database';

interface ChartDataItem {
  name: string;
  value: number;
  assetType: AssetType;
}

interface PortfolioChartProps {
  data: ChartDataItem[];
}

const CHART_COLORS: Record<AssetType, string> = {
  GOLDBACK: 'hsl(43, 96%, 56%)',
  SILVER: 'hsl(220, 10%, 70%)',
  COPPER: 'hsl(25, 80%, 50%)',
  GOLD_CERTIFICATE: 'hsl(43, 80%, 45%)',
  SILVER_CERTIFICATE: 'hsl(220, 10%, 60%)',
  OTHER: 'hsl(220, 15%, 40%)',
};

export function PortfolioChart({ data }: PortfolioChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No holdings to display
      </div>
    );
  }

  const chartData = data.map(item => ({
    ...item,
    name: ASSET_TYPE_LABELS[item.assetType],
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ stroke: 'hsl(220, 10%, 55%)', strokeWidth: 1 }}
        >
          {chartData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={CHART_COLORS[data[index].assetType]} 
              stroke="hsl(220, 20%, 6%)"
              strokeWidth={2}
            />
          ))}
        </Pie>
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'hsl(220, 18%, 10%)', 
            border: '1px solid hsl(220, 15%, 20%)',
            borderRadius: '8px',
            color: 'hsl(45, 20%, 95%)'
          }}
          formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Value']}
        />
        <Legend 
          verticalAlign="bottom" 
          height={36}
          formatter={(value) => <span style={{ color: 'hsl(220, 10%, 55%)' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
