import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Activity, ExternalLink, AlertTriangle, RefreshCw, Zap, CheckCircle, Radio } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Auto-refill thresholds (matching edge function values)
const SOLANA_AUTO_REFILL_THRESHOLD_LAMPORTS = 50_000_000; // 0.05 SOL
const EVM_AUTO_REFILL_THRESHOLD_WEI = 50_000_000_000_000_000; // 0.05 ETH/MATIC (stored as lamports equivalent)
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

interface ArbitrageRun {
  id: string;
  strategy_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'SIMULATED' | 'EXECUTED' | 'FAILED';
  estimated_profit_lamports: number | null;
  actual_profit_lamports: number | null;
  tx_signature: string | null;
  error_message: string | null;
  created_at: string;
}

interface ArbitrageStrategy {
  id: string;
  name: string;
  chain_type: string;
  evm_network: string | null;
}

// Explorer URLs per network
const EXPLORER_URLS: Record<string, { url: string; name: string }> = {
  SOLANA: { url: 'https://solscan.io/tx/', name: 'Solscan' },
  POLYGON: { url: 'https://polygonscan.com/tx/', name: 'Polygonscan' },
  ETHEREUM: { url: 'https://etherscan.io/tx/', name: 'Etherscan' },
  ARBITRUM: { url: 'https://arbiscan.io/tx/', name: 'Arbiscan' },
  BSC: { url: 'https://bscscan.com/tx/', name: 'BscScan' },
};

// Testnet networks
const TESTNET_NETWORKS = ['SEPOLIA', 'AMOY', 'GOERLI', 'MUMBAI', 'BSC_TESTNET', 'ARBITRUM_SEPOLIA'];

// Helper: Check if network is testnet
const isTestnetNetwork = (network: string | null): boolean => {
  if (!network) return false;
  return TESTNET_NETWORKS.includes(network.toUpperCase());
};

// Helper: Check if transaction is mock/simulated
const isMockTransaction = (txSignature: string | null): boolean => {
  if (!txSignature) return false;
  return txSignature.startsWith('MOCK_') || txSignature.includes('TESTNET');
};

// Helper: Determine execution type
const getExecutionType = (status: string, network: string | null, txSignature: string | null): 'REAL' | 'MOCK' | 'TESTNET' | 'SCAN' => {
  if (status === 'SIMULATED') return 'SCAN';
  if (isMockTransaction(txSignature)) return 'MOCK';
  if (isTestnetNetwork(network)) return 'TESTNET';
  return 'REAL';
};

export default function AdminArbitrageRunsPage() {
  const [runs, setRuns] = useState<ArbitrageRun[]>([]);
  const [strategies, setStrategies] = useState<ArbitrageStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<ArbitrageRun | null>(null);
  const [strategyNames, setStrategyNames] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setIsLoading(true);

    // Fetch strategies for filter dropdown and name mapping
    const { data: stratData } = await supabase
      .from('arbitrage_strategies')
      .select('id, name, chain_type, evm_network');
    
    if (stratData) {
      setStrategies(stratData);
      const nameMap: Record<string, string> = {};
      stratData.forEach(s => { nameMap[s.id] = s.name; });
      setStrategyNames(nameMap);
    }

    // Build query for runs
    let query = supabase
      .from('arbitrage_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (selectedStrategy !== 'all') {
      query = query.eq('strategy_id', selectedStrategy);
    }

    if (selectedStatus !== 'all' && (selectedStatus === 'SIMULATED' || selectedStatus === 'EXECUTED' || selectedStatus === 'FAILED')) {
      query = query.eq('status', selectedStatus);
    }

    const { data, error } = await query;

    if (error) {
      toast.error('Failed to load runs');
      console.error(error);
    } else {
      setRuns(data as ArbitrageRun[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [selectedStrategy, selectedStatus]);

  const formatLamportsToSol = (lamports: number | null) => {
    if (lamports === null) return '-';
    return (lamports / 1_000_000_000).toFixed(6);
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'SIMULATED': return 'secondary';
      case 'EXECUTED': return 'default';
      case 'FAILED': return 'destructive';
      default: return 'outline';
    }
  };

  const getExplorerUrl = (signature: string, strategyId: string) => {
    const strategy = strategies.find(s => s.id === strategyId);
    if (!strategy) return `https://solscan.io/tx/${signature}?cluster=devnet`;
    
    if (strategy.chain_type === 'EVM') {
      const network = strategy.evm_network || 'POLYGON';
      const explorer = EXPLORER_URLS[network] || EXPLORER_URLS.POLYGON;
      return `${explorer.url}${signature}`;
    }
    
    // Solana Devnet
    return `https://solscan.io/tx/${signature}?cluster=devnet`;
  };

  const getExplorerName = (strategyId: string) => {
    const strategy = strategies.find(s => s.id === strategyId);
    if (!strategy) return 'Solscan';
    
    if (strategy.chain_type === 'EVM') {
      const network = strategy.evm_network || 'POLYGON';
      return EXPLORER_URLS[network]?.name || 'Explorer';
    }
    
    return 'Solscan';
  };

  // Check if run triggered auto-refill based on profit threshold
  const didTriggerAutoRefill = (run: ArbitrageRun) => {
    if (run.status !== 'EXECUTED') return false;
    const profit = run.actual_profit_lamports ?? run.estimated_profit_lamports ?? 0;
    const strategy = strategies.find(s => s.id === run.strategy_id);
    
    if (strategy?.chain_type === 'EVM') {
      // For EVM, profit is stored in lamports equivalent (wei / 1e9)
      // Threshold is 0.05 ETH = 50_000_000_000_000_000 wei = 50_000_000 lamports equivalent
      return profit >= SOLANA_AUTO_REFILL_THRESHOLD_LAMPORTS;
    }
    // Solana threshold
    return profit >= SOLANA_AUTO_REFILL_THRESHOLD_LAMPORTS;
  };

  return (
    <DashboardLayout title="Arbitrage Runs" subtitle="View simulation and execution history (INTERNAL ONLY)">
      <div className="space-y-6">
        {/* Warning Banner */}
        <Alert className="border-amber-500 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            <strong>INTERNAL ONLY:</strong> These runs are for internal platform optimization. 
            Current implementation uses STUB execution—no real on-chain trades are performed.
          </AlertDescription>
        </Alert>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Runs</CardDescription>
              <CardTitle className="text-2xl">{runs.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Scans</CardDescription>
              <CardTitle className="text-2xl text-blue-600">
                {runs.filter(r => r.status === 'SIMULATED').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-600" />
                Real Executions
              </CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {runs.filter(r => {
                  const strategy = strategies.find(s => s.id === r.strategy_id);
                  const execType = getExecutionType(r.status, strategy?.evm_network || null, r.tx_signature);
                  return r.status === 'EXECUTED' && execType === 'REAL';
                }).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                Testnet/Mock
              </CardDescription>
              <CardTitle className="text-2xl text-amber-600">
                {runs.filter(r => {
                  const strategy = strategies.find(s => s.id === r.strategy_id);
                  const execType = getExecutionType(r.status, strategy?.evm_network || null, r.tx_signature);
                  return r.status === 'EXECUTED' && (execType === 'MOCK' || execType === 'TESTNET');
                }).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed</CardDescription>
              <CardTitle className="text-2xl text-destructive">
                {runs.filter(r => r.status === 'FAILED').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-green-600" />
                Auto-Refills
              </CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {runs.filter(r => didTriggerAutoRefill(r)).length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Strategy:</span>
            <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Strategies</SelectItem>
                {strategies.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="SIMULATED">Simulated</SelectItem>
                <SelectItem value="EXECUTED">Executed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Link to="/admin/arbitrage/strategies" className="ml-auto">
            <Button variant="outline">View Strategies →</Button>
          </Link>
        </div>

        {/* Runs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Run History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : runs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No runs found. Run a simulation scan from the Strategies page.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Auto-Refill</TableHead>
                    <TableHead className="text-right">Est. Profit</TableHead>
                    <TableHead className="text-right">Actual Profit</TableHead>
                    <TableHead>TX Signature</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => {
                    const strategy = strategies.find(s => s.id === run.strategy_id);
                    const network = strategy?.chain_type === 'EVM' ? strategy?.evm_network : 'SOLANA';
                    const execType = getExecutionType(run.status, strategy?.evm_network || null, run.tx_signature);
                    const isTestnet = isTestnetNetwork(network);
                    const isMock = isMockTransaction(run.tx_signature);
                    
                    return (
                      <TableRow 
                        key={run.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedRun(run)}
                      >
                        <TableCell className="font-medium">
                          {strategyNames[run.strategy_id] || run.strategy_id.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={isTestnet ? 'outline' : 'secondary'} className={isTestnet ? 'border-amber-500 text-amber-600' : ''}>
                            {network || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {execType === 'REAL' && (
                            <Badge className="bg-green-600 hover:bg-green-700">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              REAL
                            </Badge>
                          )}
                          {execType === 'MOCK' && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                              <Radio className="h-3 w-3 mr-1" />
                              MOCK
                            </Badge>
                          )}
                          {execType === 'TESTNET' && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              TESTNET
                            </Badge>
                          )}
                          {execType === 'SCAN' && (
                            <Badge variant="secondary">
                              SCAN
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(run.status)}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {didTriggerAutoRefill(run) ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="inline-flex items-center gap-1 text-green-600">
                                    <Zap className="h-4 w-4 fill-current" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Auto-refill triggered</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatLamportsToSol(run.estimated_profit_lamports)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatLamportsToSol(run.actual_profit_lamports)}
                        </TableCell>
                        <TableCell>
                          {run.tx_signature ? (
                            <div className="flex flex-col gap-1">
                              {isMock ? (
                                <span className="text-amber-600 text-xs font-mono">{run.tx_signature.slice(0, 16)}...</span>
                              ) : (
                                run.tx_signature.split(',').map((sig, idx) => (
                                  <a 
                                    key={idx}
                                    href={getExplorerUrl(sig.trim(), run.strategy_id)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {sig.trim().slice(0, 8)}...
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ))
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(run.started_at), 'MMM d, HH:mm:ss')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={!!selectedRun} onOpenChange={() => setSelectedRun(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Run Details</DialogTitle>
            </DialogHeader>
            {selectedRun && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Strategy</p>
                    <p className="font-medium">{strategyNames[selectedRun.strategy_id] || selectedRun.strategy_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant={getStatusVariant(selectedRun.status)}>{selectedRun.status}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Profit</p>
                    <p className="font-mono">{formatLamportsToSol(selectedRun.estimated_profit_lamports)} SOL</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Actual Profit</p>
                    <p className="font-mono">{formatLamportsToSol(selectedRun.actual_profit_lamports)} SOL</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Started</p>
                    <p>{format(new Date(selectedRun.started_at), 'PPpp')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Finished</p>
                    <p>{selectedRun.finished_at ? format(new Date(selectedRun.finished_at), 'PPpp') : '-'}</p>
                  </div>
                </div>
                {selectedRun.tx_signature && (
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Transaction ({getExplorerName(selectedRun.strategy_id)})
                    </p>
                    <div className="space-y-1">
                      {selectedRun.tx_signature.split(',').map((sig, idx) => (
                        <a 
                          key={idx}
                          href={getExplorerUrl(sig.trim(), selectedRun.strategy_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline break-all block"
                        >
                          {sig.trim()}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {selectedRun.error_message && (
                  <div>
                    <p className="text-sm text-muted-foreground">Error Message</p>
                    <p className="text-destructive bg-destructive/10 p-2 rounded text-sm">
                      {selectedRun.error_message}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
