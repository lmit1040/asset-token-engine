import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, ExternalLink, TrendingUp, Zap, ArrowUpRight, Radio, Download, CalendarIcon, X } from 'lucide-react';
import { format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { toast } from 'sonner';
import { DateRange } from 'react-day-picker';

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

type StatusFilter = 'all' | 'EXECUTED' | 'SIMULATED' | 'FAILED';

export function OpsWalletTransactionHistory() {
  const [arbitrageRuns, setArbitrageRuns] = useState<ArbitrageRun[]>([]);
  const [topups, setTopups] = useState<FeePayerTopup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const fetchStrategyDetails = async (strategyId: string) => {
    const { data } = await supabase
      .from('arbitrage_strategies')
      .select('id, name, chain_type, evm_network')
      .eq('id', strategyId)
      .maybeSingle();
    return data;
  };

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
        .limit(100);

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
        .limit(100);

      setTopups(topupsData || []);
    } catch (error) {
      console.error('Failed to fetch transaction history:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();

    // Set up realtime subscriptions
    const arbitrageChannel = supabase
      .channel('arbitrage-runs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'arbitrage_runs'
        },
        async (payload) => {
          console.log('[Realtime] Arbitrage run change:', payload);
          setIsLive(true);
          
          if (payload.eventType === 'INSERT') {
            const newRun = payload.new as ArbitrageRun;
            const strategy = await fetchStrategyDetails(newRun.strategy_id);
            setArbitrageRuns(prev => [{
              ...newRun,
              strategy: strategy || undefined
            }, ...prev.slice(0, 99)]);
            toast.info('New arbitrage run detected');
          } else if (payload.eventType === 'UPDATE') {
            const updatedRun = payload.new as ArbitrageRun;
            setArbitrageRuns(prev => prev.map(run => 
              run.id === updatedRun.id 
                ? { ...run, ...updatedRun }
                : run
            ));
          }
          
          setTimeout(() => setIsLive(false), 2000);
        }
      )
      .subscribe();

    const topupsChannel = supabase
      .channel('fee-payer-topups-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'fee_payer_topups'
        },
        (payload) => {
          console.log('[Realtime] Fee payer topup:', payload);
          setIsLive(true);
          
          const newTopup = payload.new as FeePayerTopup;
          setTopups(prev => [newTopup, ...prev.slice(0, 99)]);
          toast.info('New fee payer top-up detected');
          
          setTimeout(() => setIsLive(false), 2000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(arbitrageChannel);
      supabase.removeChannel(topupsChannel);
    };
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

  // Filter arbitrage runs
  const filteredArbitrageRuns = useMemo(() => {
    return arbitrageRuns.filter(run => {
      // Status filter
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;
      
      // Date range filter
      if (dateRange?.from) {
        const runDate = new Date(run.started_at);
        if (isBefore(runDate, startOfDay(dateRange.from))) return false;
        if (dateRange.to && isAfter(runDate, endOfDay(dateRange.to))) return false;
      }
      
      return true;
    });
  }, [arbitrageRuns, statusFilter, dateRange]);

  // Filter topups
  const filteredTopups = useMemo(() => {
    return topups.filter(topup => {
      if (dateRange?.from) {
        const topupDate = new Date(topup.created_at);
        if (isBefore(topupDate, startOfDay(dateRange.from))) return false;
        if (dateRange.to && isAfter(topupDate, endOfDay(dateRange.to))) return false;
      }
      return true;
    });
  }, [topups, dateRange]);

  const clearFilters = () => {
    setStatusFilter('all');
    setDateRange(undefined);
  };

  const hasActiveFilters = statusFilter !== 'all' || dateRange?.from;

  // CSV Export
  const exportArbitrageCSV = () => {
    const headers = ['Time', 'Strategy', 'Chain', 'Status', 'Estimated Profit (SOL)', 'Actual Profit (SOL)', 'TX Signature'];
    const rows = filteredArbitrageRuns.map(run => [
      format(new Date(run.started_at), 'yyyy-MM-dd HH:mm:ss'),
      run.strategy?.name || 'Unknown',
      run.strategy?.chain_type || 'SOLANA',
      run.status,
      run.estimated_profit_lamports !== null ? (run.estimated_profit_lamports / 1_000_000_000).toFixed(9) : '',
      run.actual_profit_lamports !== null ? (run.actual_profit_lamports / 1_000_000_000).toFixed(9) : '',
      run.tx_signature || ''
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    downloadCSV(csv, `arbitrage-runs-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Arbitrage runs exported');
  };

  const exportTopupsCSV = () => {
    const headers = ['Time', 'Fee Payer', 'Amount (SOL)', 'TX Signature'];
    const rows = filteredTopups.map(topup => [
      format(new Date(topup.created_at), 'yyyy-MM-dd HH:mm:ss'),
      topup.fee_payer_public_key,
      (topup.amount_lamports / 1_000_000_000).toFixed(9),
      topup.tx_signature || ''
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    downloadCSV(csv, `fee-payer-topups-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('Top-ups exported');
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              OPS Wallet Activity
              {isLive && (
                <span className="flex items-center gap-1 text-xs font-normal text-green-600">
                  <Radio className="h-3 w-3 animate-pulse" />
                  Live
                </span>
              )}
            </CardTitle>
            <CardDescription>Recent arbitrage executions and fee payer top-ups</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-normal">
              <span className={`w-2 h-2 rounded-full mr-1.5 ${isLive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
              Realtime
            </Badge>
            <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="EXECUTED">Executed</SelectItem>
              <SelectItem value="SIMULATED">Simulated</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                <CalendarIcon className="h-3 w-3" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d')}
                    </>
                  ) : (
                    format(dateRange.from, 'MMM d, yyyy')
                  )
                ) : (
                  'Date Range'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}

          <div className="ml-auto" />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="arbitrage" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="arbitrage" className="text-xs">
              <ArrowUpRight className="h-3 w-3 mr-1" />
              Arbitrage Runs ({filteredArbitrageRuns.length})
            </TabsTrigger>
            <TabsTrigger value="topups" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              Fee Payer Top-ups ({filteredTopups.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="arbitrage" className="mt-0">
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={exportArbitrageCSV} disabled={filteredArbitrageRuns.length === 0}>
                <Download className="h-3 w-3" />
                Export CSV
              </Button>
            </div>
            {filteredArbitrageRuns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {arbitrageRuns.length === 0 ? 'No arbitrage runs yet' : 'No runs match filters'}
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
                    {filteredArbitrageRuns.slice(0, 20).map(run => (
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
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={exportTopupsCSV} disabled={filteredTopups.length === 0}>
                <Download className="h-3 w-3" />
                Export CSV
              </Button>
            </div>
            {filteredTopups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {topups.length === 0 ? 'No top-ups yet' : 'No top-ups match filters'}
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
                    {filteredTopups.slice(0, 20).map(topup => (
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