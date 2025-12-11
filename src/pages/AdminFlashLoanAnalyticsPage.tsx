import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, DollarSign, TrendingUp, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

type TimeRange = "24h" | "7d" | "30d" | "all";

export default function AdminFlashLoanAnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  const getDateFilter = () => {
    const now = new Date();
    switch (timeRange) {
      case "24h":
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case "7d":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case "30d":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return null;
    }
  };

  const { data: flashLoanRuns, isLoading } = useQuery({
    queryKey: ["flash-loan-analytics", timeRange],
    queryFn: async () => {
      let query = supabase
        .from("arbitrage_runs")
        .select("*")
        .eq("used_flash_loan", true)
        .order("created_at", { ascending: false });

      const dateFilter = getDateFilter();
      if (dateFilter) {
        query = query.gte("created_at", dateFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: legacyRuns } = useQuery({
    queryKey: ["legacy-arbitrage-analytics", timeRange],
    queryFn: async () => {
      let query = supabase
        .from("arbitrage_runs")
        .select("*")
        .or("used_flash_loan.is.null,used_flash_loan.eq.false")
        .eq("status", "EXECUTED")
        .order("created_at", { ascending: false });

      const dateFilter = getDateFilter();
      if (dateFilter) {
        query = query.gte("created_at", dateFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["flash-loan-providers-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flash_loan_providers")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate statistics
  const stats = {
    totalFlashLoans: flashLoanRuns?.length || 0,
    executedFlashLoans: flashLoanRuns?.filter(r => r.status === "EXECUTED").length || 0,
    failedFlashLoans: flashLoanRuns?.filter(r => r.status === "FAILED").length || 0,
    totalFeesPaid: flashLoanRuns?.reduce((sum, r) => sum + (parseFloat(r.flash_loan_fee || "0")), 0) || 0,
    totalFlashLoanVolume: flashLoanRuns?.reduce((sum, r) => sum + (parseFloat(r.flash_loan_amount || "0")), 0) || 0,
    flashLoanProfit: flashLoanRuns?.filter(r => r.status === "EXECUTED").reduce((sum, r) => sum + (r.actual_profit_lamports || 0), 0) || 0,
    legacyProfit: legacyRuns?.reduce((sum, r) => sum + (r.actual_profit_lamports || 0), 0) || 0,
    legacyCount: legacyRuns?.length || 0,
  };

  const successRate = stats.totalFlashLoans > 0 
    ? ((stats.executedFlashLoans / stats.totalFlashLoans) * 100).toFixed(1) 
    : "0";

  const avgProfitPerFlashLoan = stats.executedFlashLoans > 0
    ? (stats.flashLoanProfit / stats.executedFlashLoans / 1e9).toFixed(4)
    : "0";

  const avgProfitPerLegacy = stats.legacyCount > 0
    ? (stats.legacyProfit / stats.legacyCount / 1e9).toFixed(4)
    : "0";

  // Group by provider
  const providerStats = flashLoanRuns?.reduce((acc, run) => {
    const provider = run.flash_loan_provider || "Unknown";
    if (!acc[provider]) {
      acc[provider] = { count: 0, profit: 0, fees: 0, failed: 0 };
    }
    acc[provider].count++;
    if (run.status === "EXECUTED") {
      acc[provider].profit += run.actual_profit_lamports || 0;
    } else if (run.status === "FAILED") {
      acc[provider].failed++;
    }
    acc[provider].fees += parseFloat(run.flash_loan_fee || "0");
    return acc;
  }, {} as Record<string, { count: number; profit: number; fees: number; failed: number }>);

  return (
    <DashboardLayout title="Flash Loan Analytics" subtitle="Usage statistics, fees, and profit comparison" requireAdmin>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Flash Loan Analytics</h1>
            <p className="text-muted-foreground">Usage statistics, fees, and profit comparison</p>
          </div>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Flash Loans</CardTitle>
              <Zap className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalFlashLoans}</div>
              <p className="text-xs text-muted-foreground">
                {stats.executedFlashLoans} executed, {stats.failedFlashLoans} failed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{successRate}%</div>
              <p className="text-xs text-muted-foreground">
                Flash loan execution success
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Fees Paid</CardTitle>
              <DollarSign className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalFeesPaid.toFixed(4)}</div>
              <p className="text-xs text-muted-foreground">
                Native token units
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Loan Volume</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalFlashLoanVolume.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Total borrowed amount
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Atomic vs Legacy Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Execution Mode Comparison</CardTitle>
            <CardDescription>Atomic flash loans vs legacy multi-step execution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Atomic (Flash Loan)</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Executions:</span>
                    <span className="font-medium">{stats.executedFlashLoans}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Profit:</span>
                    <span className="font-medium text-green-500">
                      {(stats.flashLoanProfit / 1e9).toFixed(4)} native
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Profit/Trade:</span>
                    <span className="font-medium">{avgProfitPerFlashLoan} native</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fees Paid:</span>
                    <span className="font-medium text-amber-500">
                      {stats.totalFeesPaid.toFixed(4)} native
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net Profit:</span>
                    <span className="font-medium text-green-500">
                      {((stats.flashLoanProfit / 1e9) - stats.totalFeesPaid).toFixed(4)} native
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">Legacy (Multi-Step)</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Executions:</span>
                    <span className="font-medium">{stats.legacyCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Profit:</span>
                    <span className="font-medium text-green-500">
                      {(stats.legacyProfit / 1e9).toFixed(4)} native
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Profit/Trade:</span>
                    <span className="font-medium">{avgProfitPerLegacy} native</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fees Paid:</span>
                    <span className="font-medium">Gas only (2 txs)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capital Required:</span>
                    <span className="font-medium text-amber-500">Yes (OPS wallet)</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Provider Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Provider Statistics</CardTitle>
            <CardDescription>Flash loan usage by provider</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(providerStats || {}).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No flash loan executions recorded yet
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(providerStats || {}).map(([provider, data]) => (
                  <div key={provider} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Zap className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{provider}</p>
                        <p className="text-sm text-muted-foreground">
                          {data.count} loans, {data.failed} failed
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-500">
                        +{(data.profit / 1e9).toFixed(4)} profit
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {data.fees.toFixed(4)} fees
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Providers */}
        <Card>
          <CardHeader>
            <CardTitle>Configured Providers</CardTitle>
            <CardDescription>Active flash loan providers with receiver contracts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {providers?.map((provider) => (
                <div key={provider.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium">{provider.display_name}</p>
                    <p className="text-sm text-muted-foreground">{provider.chain}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {provider.receiver_contract_address ? (
                      <Badge variant="default" className="bg-green-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Atomic Ready
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Legacy Only
                      </Badge>
                    )}
                    <Badge variant="outline">{provider.fee_bps} bps</Badge>
                  </div>
                </div>
              ))}
              {(!providers || providers.length === 0) && (
                <p className="text-muted-foreground text-center py-4">
                  No active providers configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Flash Loan Runs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Flash Loan Executions</CardTitle>
            <CardDescription>Latest flash loan arbitrage runs</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">Loading...</p>
            ) : flashLoanRuns?.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No flash loan executions in selected time range
              </p>
            ) : (
              <div className="space-y-3">
                {flashLoanRuns?.slice(0, 10).map((run) => (
                  <div key={run.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      {run.status === "EXECUTED" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : run.status === "FAILED" ? (
                        <XCircle className="h-5 w-5 text-destructive" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{run.flash_loan_provider || "Unknown"}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(run.created_at), "MMM d, yyyy HH:mm")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {parseFloat(run.flash_loan_amount || "0").toFixed(4)} borrowed
                      </p>
                      {run.status === "EXECUTED" && (
                        <p className="text-sm text-green-500">
                          +{((run.actual_profit_lamports || 0) / 1e9).toFixed(6)} profit
                        </p>
                      )}
                      {run.status === "FAILED" && (
                        <p className="text-sm text-destructive truncate max-w-[200px]">
                          {run.error_message || "Failed"}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
