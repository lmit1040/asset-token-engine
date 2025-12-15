import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, CheckCircle, ExternalLink, Zap, Shield, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type DetectedPool = {
  id: string;
  chain: string;
  dex: string;
  pool_address: string;
  token0_address: string;
  token1_address: string;
  token0_symbol: string | null;
  token1_symbol: string | null;
  liquidity_usd: number | null;
  created_block: number | null;
  detected_at: string;
  is_rug_risk: boolean;
  rug_risk_reasons: string[] | null;
  arbitrage_attempted: boolean;
  arbitrage_result: string | null;
  status: string;
};

export default function AdminNewPoolsPage() {
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);

  // Fetch detected pools
  const { data: pools, isLoading } = useQuery({
    queryKey: ["detected-pools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("detected_pools")
        .select("*")
        .order("detected_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as DetectedPool[];
    },
  });

  // Scan for new pools mutation
  const scanMutation = useMutation({
    mutationFn: async () => {
      setIsScanning(true);
      const { data, error } = await supabase.functions.invoke("scan-new-pools");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Scan complete: ${data.pools_added} new pools detected`);
      queryClient.invalidateQueries({ queryKey: ["detected-pools"] });
    },
    onError: (error) => {
      toast.error(`Scan failed: ${error.message}`);
    },
    onSettled: () => {
      setIsScanning(false);
    },
  });

  // Attempt arbitrage on a pool
  const attemptArbitrageMutation = useMutation({
    mutationFn: async (pool: DetectedPool) => {
      // First, update pool status to MONITORING
      await supabase
        .from("detected_pools")
        .update({ status: "MONITORING", arbitrage_attempted: true })
        .eq("id", pool.id);

      // Call the execute-evm-arbitrage with the pool tokens
      // For now, we'll create a temporary strategy
      const { data, error } = await supabase.functions.invoke("execute-evm-arbitrage", {
        body: {
          strategyId: null, // Will use pool tokens directly
          poolTokens: {
            tokenIn: pool.token0_address,
            tokenOut: pool.token1_address,
            dex: pool.dex,
          },
        },
      });

      if (error) throw error;

      // Update pool with result
      await supabase
        .from("detected_pools")
        .update({
          status: data.profitable ? "TRADED" : "SKIPPED",
          arbitrage_result: JSON.stringify(data),
        })
        .eq("id", pool.id);

      return data;
    },
    onSuccess: (data) => {
      if (data.profitable) {
        toast.success(`Arbitrage executed! Profit: ${data.profit}`);
      } else {
        toast.info("No profitable opportunity found");
      }
      queryClient.invalidateQueries({ queryKey: ["detected-pools"] });
    },
    onError: (error) => {
      toast.error(`Arbitrage failed: ${error.message}`);
    },
  });

  const getStatusBadge = (pool: DetectedPool) => {
    if (pool.is_rug_risk) {
      return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Rug Risk</Badge>;
    }
    switch (pool.status) {
      case "NEW":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />New</Badge>;
      case "MONITORING":
        return <Badge className="bg-blue-500"><RefreshCw className="w-3 h-3 mr-1" />Monitoring</Badge>;
      case "TRADED":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Traded</Badge>;
      case "SKIPPED":
        return <Badge variant="outline">Skipped</Badge>;
      case "RUG_DETECTED":
        return <Badge variant="destructive"><Shield className="w-3 h-3 mr-1" />Rug Detected</Badge>;
      default:
        return <Badge variant="outline">{pool.status}</Badge>;
    }
  };

  const newPools = pools?.filter((p) => p.status === "NEW" && !p.is_rug_risk) || [];
  const riskyPools = pools?.filter((p) => p.is_rug_risk) || [];
  const tradedPools = pools?.filter((p) => p.status === "TRADED") || [];

  return (
    <DashboardLayout title="New Pool Detection">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New Pool Detection</h1>
            <p className="text-muted-foreground">
              Monitor DEX factory contracts for new token listings
            </p>
          </div>
          <Button onClick={() => scanMutation.mutate()} disabled={isScanning}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isScanning ? "animate-spin" : ""}`} />
            {isScanning ? "Scanning..." : "Scan Now"}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">New Pools</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{newPools.length}</div>
              <p className="text-xs text-muted-foreground">Ready for arbitrage</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rug Risks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{riskyPools.length}</div>
              <p className="text-xs text-muted-foreground">Auto-blocked</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Traded</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">{tradedPools.length}</div>
              <p className="text-xs text-muted-foreground">Successfully executed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Scanned</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pools?.length || 0}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
        </div>

        {/* Safety Notice */}
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-500" />
              Safety Filters Active
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-disc list-inside space-y-1">
              <li>Only pools with USDC, USDT, WMATIC, WETH, or DAI as base token</li>
              <li>Rug-pull detection checks token metadata and ownership</li>
              <li>Pools younger than ~1 hour are scanned</li>
              <li>Auto-blocks tokens with suspicious contract patterns</li>
            </ul>
          </CardContent>
        </Card>

        {/* Tabs for different pool statuses */}
        <Tabs defaultValue="new">
          <TabsList>
            <TabsTrigger value="new">New Pools ({newPools.length})</TabsTrigger>
            <TabsTrigger value="risky">Rug Risks ({riskyPools.length})</TabsTrigger>
            <TabsTrigger value="all">All Pools</TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>New Pools Ready for Arbitrage</CardTitle>
                <CardDescription>
                  These pools passed safety checks and are ready for arbitrage attempts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pair</TableHead>
                      <TableHead>DEX</TableHead>
                      <TableHead>Detected</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newPools.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No new pools detected. Click "Scan Now" to check for new listings.
                        </TableCell>
                      </TableRow>
                    ) : (
                      newPools.map((pool) => (
                        <TableRow key={pool.id}>
                          <TableCell className="font-mono">
                            {pool.token0_symbol || "???"}/{pool.token1_symbol || "???"}
                          </TableCell>
                          <TableCell>{pool.dex}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(pool.detected_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell>{getStatusBadge(pool)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => attemptArbitrageMutation.mutate(pool)}
                                disabled={attemptArbitrageMutation.isPending}
                              >
                                <Zap className="w-3 h-3 mr-1" />
                                Execute
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                              >
                                <a
                                  href={`https://polygonscan.com/address/${pool.pool_address}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risky" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Detected Rug Risks</CardTitle>
                <CardDescription>
                  These pools were auto-blocked due to suspicious patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pair</TableHead>
                      <TableHead>DEX</TableHead>
                      <TableHead>Risk Reasons</TableHead>
                      <TableHead>Detected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {riskyPools.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No rug risks detected yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      riskyPools.map((pool) => (
                        <TableRow key={pool.id}>
                          <TableCell className="font-mono">
                            {pool.token0_symbol || "???"}/{pool.token1_symbol || "???"}
                          </TableCell>
                          <TableCell>{pool.dex}</TableCell>
                          <TableCell>
                            <ul className="text-xs text-red-500">
                              {pool.rug_risk_reasons?.map((reason, i) => (
                                <li key={i}>• {reason}</li>
                              ))}
                            </ul>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(pool.detected_at), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>All Detected Pools</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pair</TableHead>
                      <TableHead>DEX</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Detected</TableHead>
                      <TableHead>Pool</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">Loading...</TableCell>
                      </TableRow>
                    ) : pools?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No pools detected yet. Click "Scan Now" to start.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pools?.map((pool) => (
                        <TableRow key={pool.id}>
                          <TableCell className="font-mono">
                            {pool.token0_symbol || "???"}/{pool.token1_symbol || "???"}
                          </TableCell>
                          <TableCell>{pool.dex}</TableCell>
                          <TableCell>{getStatusBadge(pool)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(pool.detected_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <a
                              href={`https://polygonscan.com/address/${pool.pool_address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline font-mono text-xs"
                            >
                              {pool.pool_address.slice(0, 8)}...
                            </a>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
