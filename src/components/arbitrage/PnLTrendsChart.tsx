import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, subDays, subWeeks, subMonths, startOfDay, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { TrendingUp, TrendingDown } from "lucide-react";

interface ArbitrageRun {
  id: string;
  created_at: string;
  actual_profit_lamports: number | null;
  status: string;
  strategy_id: string;
}

interface PnLTrendsChartProps {
  runs: ArbitrageRun[];
}

type TimeRange = "daily" | "weekly" | "monthly";

const chartConfig = {
  pnl: {
    label: "PnL",
    color: "hsl(var(--primary))",
  },
  cumulative: {
    label: "Cumulative",
    color: "hsl(var(--chart-2))",
  },
};

export function PnLTrendsChart({ runs }: PnLTrendsChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");

  const chartData = useMemo(() => {
    const executedRuns = runs.filter(r => r.status === "EXECUTED" && r.actual_profit_lamports !== null);
    
    if (executedRuns.length === 0) return [];

    const now = new Date();
    let startDate: Date;
    let groupFn: (date: Date) => string;
    let formatFn: (date: string) => string;

    switch (timeRange) {
      case "daily":
        startDate = subDays(now, 30);
        groupFn = (date) => format(startOfDay(date), "yyyy-MM-dd");
        formatFn = (date) => format(parseISO(date), "MMM d");
        break;
      case "weekly":
        startDate = subWeeks(now, 12);
        groupFn = (date) => format(startOfWeek(date), "yyyy-MM-dd");
        formatFn = (date) => format(parseISO(date), "MMM d");
        break;
      case "monthly":
        startDate = subMonths(now, 12);
        groupFn = (date) => format(startOfMonth(date), "yyyy-MM");
        formatFn = (date) => format(parseISO(date + "-01"), "MMM yyyy");
        break;
    }

    // Group runs by period
    const grouped: Record<string, number> = {};
    executedRuns.forEach(run => {
      const runDate = new Date(run.created_at);
      if (runDate >= startDate) {
        const key = groupFn(runDate);
        grouped[key] = (grouped[key] || 0) + (run.actual_profit_lamports || 0);
      }
    });

    // Convert to array and sort
    const sortedKeys = Object.keys(grouped).sort();
    let cumulative = 0;
    
    return sortedKeys.map(key => {
      const pnlSol = grouped[key] / 1e9; // Convert lamports to SOL
      cumulative += pnlSol;
      return {
        date: key,
        label: formatFn(key),
        pnl: Number(pnlSol.toFixed(6)),
        cumulative: Number(cumulative.toFixed(6)),
      };
    });
  }, [runs, timeRange]);

  const totalPnL = chartData.reduce((sum, d) => sum + d.pnl, 0);
  const isPositive = totalPnL >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">PnL Trends</CardTitle>
          <div className={`flex items-center gap-1 text-sm ${isPositive ? "text-green-500" : "text-red-500"}`}>
            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span>{isPositive ? "+" : ""}{totalPnL.toFixed(6)} SOL</span>
          </div>
        </div>
        <div className="flex gap-1">
          {(["daily", "weekly", "monthly"] as TimeRange[]).map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange(range)}
              className="capitalize"
            >
              {range}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No executed arbitrage runs found
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                  className="text-muted-foreground"
                />
                <ChartTooltip 
                  content={<ChartTooltipContent />}
                  formatter={(value: number) => [`${value.toFixed(6)} SOL`]}
                />
                <Area
                  type="monotone"
                  dataKey="pnl"
                  stroke="hsl(var(--primary))"
                  fill="url(#pnlGradient)"
                  strokeWidth={2}
                  name="Period PnL"
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="hsl(var(--chart-2))"
                  fill="url(#cumulativeGradient)"
                  strokeWidth={2}
                  name="Cumulative"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
