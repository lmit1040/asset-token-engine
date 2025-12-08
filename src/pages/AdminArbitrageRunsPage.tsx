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
import { Activity, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';
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
}

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
      .select('id, name');
    
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

  const getSolscanUrl = (signature: string) => 
    `https://solscan.io/tx/${signature}?cluster=devnet`;

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Runs</CardDescription>
              <CardTitle className="text-2xl">{runs.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Simulated</CardDescription>
              <CardTitle className="text-2xl text-blue-600">
                {runs.filter(r => r.status === 'SIMULATED').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Executed</CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {runs.filter(r => r.status === 'EXECUTED').length}
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
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Est. Profit (SOL)</TableHead>
                    <TableHead className="text-right">Actual Profit (SOL)</TableHead>
                    <TableHead>TX Signature</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Finished</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow 
                      key={run.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedRun(run)}
                    >
                      <TableCell className="font-medium">
                        {strategyNames[run.strategy_id] || run.strategy_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(run.status)}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatLamportsToSol(run.estimated_profit_lamports)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatLamportsToSol(run.actual_profit_lamports)}
                      </TableCell>
                      <TableCell>
                        {run.tx_signature ? (
                          <a 
                            href={getSolscanUrl(run.tx_signature)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {run.tx_signature.slice(0, 8)}...
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {run.error_message ? (
                          <span className="text-sm text-destructive truncate max-w-32 block">
                            {run.error_message.slice(0, 30)}...
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(run.started_at), 'MMM d, HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        {run.finished_at 
                          ? format(new Date(run.finished_at), 'HH:mm:ss')
                          : <span className="text-muted-foreground">-</span>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
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
                    <p className="text-sm text-muted-foreground">Transaction</p>
                    <a 
                      href={getSolscanUrl(selectedRun.tx_signature)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline break-all"
                    >
                      {selectedRun.tx_signature}
                    </a>
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
