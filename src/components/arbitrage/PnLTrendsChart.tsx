import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, subDays, subWeeks, subMonths, startOfDay, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { TrendingUp, TrendingDown } from "lucide-react";

interface ArbitrageRun {
  id: string;
  created_at: string;
  actual_profit_lamports: number | null;
  status: string;
  strategy_id: string;
}

interface ArbitrageStrategy {
  id: string;
  chain_type: string;
}

interface PnLTrendsChartProps {
  runs: ArbitrageRun[];
  strategies?: ArbitrageStrategy[];
}

type TimeRange = "daily" | "weekly" | "monthly";

const chartConfig = {
  solana: {
    label: "Solana",
    color: "hsl(var(--chart-1))",
  },
  evm: {
    label: "EVM",
    color: "hsl(var(--chart-3))",
  },
  total: {
    label: "Total",
    color: "hsl(var(--primary))",
  },
};

export function PnLTrendsChart({ runs, strategies = [] }: PnLTrendsChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");

  // Create a map of strategy_id to chain_type
  const strategyChainMap = useMemo(() => {
    const map = new Map<string, string>();
    strategies.forEach(s => map.set(s.id, s.chain_type));
    return map;
  }, [strategies]);

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

    // Group runs by period and chain
    const grouped: Record<string, { solana: number; evm: number }> = {};
    
    executedRuns.forEach(run => {
      const runDate = new Date(run.created_at);
      if (runDate >= startDate) {
        const key = groupFn(runDate);
        if (!grouped[key]) {
          grouped[key] = { solana: 0, evm: 0 };
        }
        
        const chainType = strategyChainMap.get(run.strategy_id) || "SOLANA";
        const profitNative = (run.actual_profit_lamports || 0) / 1e9; // Convert to native units
        
        if (chainType === "SOLANA") {
          grouped[key].solana += profitNative;
        } else {
          grouped[key].evm += profitNative;
        }
      }
    });

    // Convert to array and sort
    const sortedKeys = Object.keys(grouped).sort();
    let cumulativeSolana = 0;
    let cumulativeEvm = 0;
    
    return sortedKeys.map(key => {
      cumulativeSolana += grouped[key].solana;
      cumulativeEvm += grouped[key].evm;
      const total = grouped[key].solana + grouped[key].evm;
      
      return {
        date: key,
        label: formatFn(key),
        solana: Number(grouped[key].solana.toFixed(6)),
        evm: Number(grouped[key].evm.toFixed(6)),
        total: Number(total.toFixed(6)),
        cumulativeSolana: Number(cumulativeSolana.toFixed(6)),
        cumulativeEvm: Number(cumulativeEvm.toFixed(6)),
      };
    });
  }, [runs, timeRange, strategyChainMap]);

  const totalSolana = chartData.reduce((sum, d) => sum + d.solana, 0);
  const totalEvm = chartData.reduce((sum, d) => sum + d.evm, 0);
  const totalPnL = totalSolana + totalEvm;
  const isPositive = totalPnL >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-4">
          <CardTitle className="text-lg">PnL Trends by Chain</CardTitle>
          <div className="flex items-center gap-3 text-sm">
            <div className={`flex items-center gap-1 ${isPositive ? "text-green-500" : "text-red-500"}`}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>Total: {isPositive ? "+" : ""}{totalPnL.toFixed(6)}</span>
            </div>
            <span className="text-muted-foreground">|</span>
            <span className="text-[hsl(var(--chart-1))]">SOL: {totalSolana >= 0 ? "+" : ""}{totalSolana.toFixed(6)}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-[hsl(var(--chart-3))]">EVM: {totalEvm >= 0 ? "+" : ""}{totalEvm.toFixed(6)}</span>
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
                  <linearGradient id="solanaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="evmGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
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
                  formatter={(value: number, name: string) => {
                    const unit = name.toLowerCase().includes('evm') ? 'native' : 'SOL';
                    return [`${value.toFixed(6)} ${unit}`, name];
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="solana"
                  stroke="hsl(var(--chart-1))"
                  fill="url(#solanaGradient)"
                  strokeWidth={2}
                  name="Solana PnL"
                />
                <Area
                  type="monotone"
                  dataKey="evm"
                  stroke="hsl(var(--chart-3))"
                  fill="url(#evmGradient)"
                  strokeWidth={2}
                  name="EVM PnL"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}