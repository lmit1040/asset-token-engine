import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, ExternalLink, TrendingUp, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { format } from 'date-fns';

interface ArbitrageRun {
  id: string;
  strategy_id: string;
  status: string;
  estimated_profit_lamports: number | null;
  actual_profit_lamports: number | null;
  tx_signature: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  strategy?: {
    name: string;
    chain_type: string;
    evm_network: string | null;
  };
}

interface FeePayerTopup {
  id: string;
  fee_payer_public_key: string;
  amount_lamports: number;
  tx_signature: string | null;
  created_at: string;
}

export function OpsWalletTransactionHistory() {
  const [arbitrageRuns, setArbitrageRuns] = useState<ArbitrageRun[]>([]);
  const [topups, setTopups] = useState<FeePayerTopup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      // Fetch recent arbitrage runs
      const { data: runsData } = await supabase
        .from('arbitrage_runs')
        .select(`
          id,
          strategy_id,
          status,
          estimated_profit_lamports,
          actual_profit_lamports,
          tx_signature,
          error_message,
          started_at,
          finished_at
        `)
        .order('started_at', { ascending: false })
        .limit(10);

      // Fetch strategy details separately
      if (runsData && runsData.length > 0) {
        const strategyIds = [...new Set(runsData.map(r => r.strategy_id))];
        const { data: strategiesData } = await supabase
          .from('arbitrage_strategies')
          .select('id, name, chain_type, evm_network')
          .in('id', strategyIds);

        const strategiesMap = new Map(strategiesData?.map(s => [s.id, s]) || []);
        
        const runsWithStrategies = runsData.map(run => ({
          ...run,
          strategy: strategiesMap.get(run.strategy_id) || undefined
        }));
        
        setArbitrageRuns(runsWithStrategies);
      } else {
        setArbitrageRuns([]);
      }

      // Fetch recent fee payer top-ups
      const { data: topupsData } = await supabase
        .from('fee_payer_topups')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      setTopups(topupsData || []);
    } catch (error) {
      console.error('Failed to fetch transaction history:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const formatLamports = (lamports: number | null) => {
    if (lamports === null) return '-';
    return `${(lamports / 1_000_000_000).toFixed(6)} SOL`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'EXECUTED':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">Executed</Badge>;
      case 'SIMULATED':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">Simulated</Badge>;
      case 'FAILED':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getExplorerUrl = (signature: string, chainType?: string, evmNetwork?: string | null) => {
    if (chainType === 'EVM' && evmNetwork) {
      const explorers: Record<string, string> = {
        POLYGON: 'https://polygonscan.com/tx/',
        ETHEREUM: 'https://etherscan.io/tx/',
        ARBITRUM: 'https://arbiscan.io/tx/',
        BSC: 'https://bscscan.com/tx/',
      };
      return `${explorers[evmNetwork] || explorers.POLYGON}${signature}`;
    }
    return `https://solscan.io/tx/${signature}?cluster=devnet`;
  };

  const truncateSignature = (sig: string) => `${sig.slice(0, 8)}...${sig.slice(-6)}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              OPS Wallet Activity
            </CardTitle>
            <CardDescription>Recent arbitrage executions and fee payer top-ups</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="arbitrage" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="arbitrage" className="text-xs">
              <ArrowUpRight className="h-3 w-3 mr-1" />
              Arbitrage Runs ({arbitrageRuns.length})
            </TabsTrigger>
            <TabsTrigger value="topups" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              Fee Payer Top-ups ({topups.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="arbitrage" className="mt-0">
            {arbitrageRuns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No arbitrage runs yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Time</TableHead>
                      <TableHead className="text-xs">Strategy</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Profit</TableHead>
                      <TableHead className="text-xs">TX</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arbitrageRuns.map(run => (
                      <TableRow key={run.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(run.started_at), 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px] px-1">
                              {run.strategy?.chain_type || 'SOLANA'}
                            </Badge>
                            <span className="truncate max-w-[100px]">
                              {run.strategy?.name || 'Unknown'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(run.status)}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {run.status === 'EXECUTED' && run.actual_profit_lamports !== null ? (
                            <span className={run.actual_profit_lamports > 0 ? 'text-green-600' : 'text-destructive'}>
                              {run.actual_profit_lamports > 0 ? '+' : ''}{formatLamports(run.actual_profit_lamports)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              ~{formatLamports(run.estimated_profit_lamports)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {run.tx_signature ? (
                            <a
                              href={getExplorerUrl(run.tx_signature, run.strategy?.chain_type, run.strategy?.evm_network)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
                            >
                              {truncateSignature(run.tx_signature.split(',')[0])}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="topups" className="mt-0">
            {topups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No top-ups yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Time</TableHead>
                      <TableHead className="text-xs">Fee Payer</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs">TX</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topups.map(topup => (
                      <TableRow key={topup.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(topup.created_at), 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {topup.fee_payer_public_key.slice(0, 8)}...{topup.fee_payer_public_key.slice(-4)}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-green-600">
                          +{formatLamports(topup.amount_lamports)}
                        </TableCell>
                        <TableCell>
                          {topup.tx_signature ? (
                            <a
                              href={`https://solscan.io/tx/${topup.tx_signature}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
                            >
                              {truncateSignature(topup.tx_signature)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
