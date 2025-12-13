import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { 
  Zap, 
  ShieldAlert, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  ExternalLink,
  Settings,
  Search,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  XCircle,
  Timer,
  History
} from 'lucide-react';
import { PnLTrendsChart } from '@/components/arbitrage/PnLTrendsChart';

interface SystemSettings {
  id: string;
  auto_arbitrage_enabled: boolean;
  auto_flash_loans_enabled: boolean;
  safe_mode_enabled: boolean;
  max_global_daily_loss_native: number;
  max_global_trades_per_day: number;
  safe_mode_triggered_at: string | null;
  safe_mode_reason: string | null;
}

interface ArbitrageStrategy {
  id: string;
  name: string;
  chain_type: string;
  evm_network: string | null;
  is_enabled: boolean;
  is_auto_enabled: boolean;
  is_for_fee_payer_refill: boolean;
  is_for_ops_refill: boolean;
  min_expected_profit_native: number;
  min_profit_to_gas_ratio: number;
  max_daily_loss_native: number;
  max_trades_per_day: number;
  max_trade_value_native: number | null;
}

interface ArbitrageRun {
  id: string;
  strategy_id: string;
  status: string;
  estimated_profit_lamports: number;
  actual_profit_lamports: number | null;
  estimated_gas_cost_native: number | null;
  tx_signature: string | null;
  error_message: string | null;
  auto_executed: boolean;
  purpose: string;
  run_type: string;
  created_at: string;
  finished_at: string | null;
  approved_for_auto_execution: boolean;
}

interface DailyRiskLimit {
  strategy_id: string;
  chain: string;
  date: string;
  total_trades: number;
  total_pnl_native: number;
  total_loss_native: number;
}

interface WalletRefillRequest {
  id: string;
  wallet_type: string;
  wallet_address: string;
  chain: string;
  reason: string;
  status: string;
  created_at: string;
}

interface AutomationLog {
  id: string;
  cycle_started_at: string;
  cycle_finished_at: string | null;
  trigger_type: string;
  overall_status: string;
  error_message: string | null;
  scan_solana_result: unknown;
  scan_evm_result: unknown;
  decision_result: unknown;
  execution_result: unknown;
  wallet_check_result: unknown;
}

const EXPLORER_URLS: Record<string, string> = {
  SOLANA: 'https://solscan.io/tx/',
  POLYGON: 'https://polygonscan.com/tx/',
  ETHEREUM: 'https://etherscan.io/tx/',
  ARBITRUM: 'https://arbiscan.io/tx/',
  BSC: 'https://bscscan.com/tx/',
};

type OpportunityFilter = 'all' | 'errors' | 'profitable' | 'approved';

export default function AdminAutomatedArbitragePage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [strategies, setStrategies] = useState<ArbitrageStrategy[]>([]);
  const [runs, setRuns] = useState<ArbitrageRun[]>([]);
  const [dailyLimits, setDailyLimits] = useState<DailyRiskLimit[]>([]);
  const [refillRequests, setRefillRequests] = useState<WalletRefillRequest[]>([]);
  const [automationLogs, setAutomationLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [runningCycle, setRunningCycle] = useState(false);
  
  // New state for enhanced functionality
  const [scanning, setScanning] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [checkingWallets, setCheckingWallets] = useState(false);
  const [opportunityFilter, setOpportunityFilter] = useState<OpportunityFilter>('all');
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch system settings
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (settingsData) {
        setSettings(settingsData as SystemSettings);
      }

      // Fetch strategies
      const { data: strategiesData } = await supabase
        .from('arbitrage_strategies')
        .select('*')
        .order('name');
      
      if (strategiesData) {
        setStrategies(strategiesData as ArbitrageStrategy[]);
      }

      // Fetch recent runs
      const { data: runsData } = await supabase
        .from('arbitrage_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (runsData) {
        setRuns(runsData as ArbitrageRun[]);
      }

      // Fetch today's risk limits
      const today = new Date().toISOString().split('T')[0];
      const { data: limitsData } = await supabase
        .from('daily_risk_limits')
        .select('*')
        .eq('date', today);
      
      if (limitsData) {
        setDailyLimits(limitsData as DailyRiskLimit[]);
      }

      // Fetch pending refill requests
      const { data: refillData } = await supabase
        .from('wallet_refill_requests')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      
      if (refillData) {
        setRefillRequests(refillData as WalletRefillRequest[]);
      }

      // Fetch automation logs
      const { data: logsData } = await supabase
        .from('automation_logs')
        .select('*')
        .order('cycle_started_at', { ascending: false })
        .limit(20);
      
      if (logsData) {
        setAutomationLogs(logsData as AutomationLog[]);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const updateSystemSetting = async (key: keyof SystemSettings, value: boolean | number) => {
    if (!settings) return;
    
    setUpdating(true);
    try {
      const updateData: Record<string, unknown> = { [key]: value };
      
      // If disabling safe mode, clear the trigger info
      if (key === 'safe_mode_enabled' && value === false) {
        updateData.safe_mode_triggered_at = null;
        updateData.safe_mode_reason = null;
      }

      const { error } = await supabase
        .from('system_settings')
        .update(updateData)
        .eq('id', settings.id);

      if (error) throw error;

      setSettings({ ...settings, ...updateData } as SystemSettings);
      toast.success(`${key} updated successfully`);
    } catch (error) {
      console.error('Error updating setting:', error);
      toast.error('Failed to update setting');
    } finally {
      setUpdating(false);
    }
  };

  const updateStrategy = async (strategyId: string, updates: Partial<ArbitrageStrategy>) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('arbitrage_strategies')
        .update(updates)
        .eq('id', strategyId);

      if (error) throw error;

      setStrategies(strategies.map(s => 
        s.id === strategyId ? { ...s, ...updates } : s
      ));
      toast.success('Strategy updated');
    } catch (error) {
      console.error('Error updating strategy:', error);
      toast.error('Failed to update strategy');
    } finally {
      setUpdating(false);
    }
  };

  // Run scan for both Solana and EVM
  const runScan = async (chainType?: 'SOLANA' | 'EVM', forceMock?: boolean) => {
    setScanning(true);
    const results: string[] = [];
    
    try {
      if (!chainType || chainType === 'SOLANA') {
        toast.info(`Scanning Solana arbitrage opportunities${forceMock ? ' (Mock Mode)' : ''}...`);
        const { data: solanaData, error: solanaError } = await supabase.functions.invoke('scan-arbitrage', {
          body: { forceMock: forceMock || false }
        });
        
        if (solanaError) {
          results.push(`Solana: Error - ${solanaError.message}`);
        } else {
          const mockInfo = solanaData?.mock_count > 0 ? ` (${solanaData.mock_count} mock)` : '';
          results.push(`Solana: ${solanaData?.simulations?.length || 0} opportunities${mockInfo}`);
        }
      }
      
      if (!chainType || chainType === 'EVM') {
        toast.info('Scanning EVM arbitrage opportunities...');
        const { data: evmData, error: evmError } = await supabase.functions.invoke('scan-evm-arbitrage');
        
        if (evmError) {
          results.push(`EVM: Error - ${evmError.message}`);
        } else {
          results.push(`EVM: ${evmData?.simulations?.length || 0} opportunities found`);
        }
      }
      
      setLastScanTime(new Date());
      toast.success(`Scan complete: ${results.join(', ')}`);
      fetchData();
    } catch (error) {
      console.error('Error running scan:', error);
      toast.error('Failed to run scan');
    } finally {
      setScanning(false);
    }
  };

  const runDecisionEngine = async () => {
    try {
      toast.info('Running decision engine...');
      const { data, error } = await supabase.functions.invoke('arb-auto-controller');
      
      if (error) throw error;
      
      toast.success(`Decision engine: ${data.approved_count || 0} runs approved`);
      fetchData();
    } catch (error) {
      console.error('Error running decision engine:', error);
      toast.error('Failed to run decision engine');
    }
  };

  const runExecutionEngine = async () => {
    try {
      toast.info('Running execution engine...');
      const { data, error } = await supabase.functions.invoke('arb-auto-execute');
      
      if (error) throw error;
      
      if (data.safe_mode_triggered) {
        toast.warning('Safe mode was triggered due to loss thresholds');
      } else {
        toast.success(`Execution: ${data.executed_count || 0} trades executed`);
      }
      fetchData();
    } catch (error) {
      console.error('Error running execution engine:', error);
      toast.error('Failed to run execution engine');
    }
  };

  // Run all engines in sequence: Scan -> Decision -> Execute
  const runAllEngines = async (useMock?: boolean) => {
    setRunningAll(true);
    try {
      // Step 1: Scan
      toast.info(`Step 1/3: Scanning for opportunities${useMock ? ' (Mock Mode)' : ''}...`);
      await supabase.functions.invoke('scan-arbitrage', { body: { forceMock: useMock || false } });
      await supabase.functions.invoke('scan-evm-arbitrage');
      
      // Step 2: Decision
      toast.info('Step 2/3: Running decision engine...');
      const { data: decisionData } = await supabase.functions.invoke('arb-auto-controller');
      
      // Step 3: Execute (only if there are approved runs)
      if (decisionData?.approved_count > 0) {
        toast.info('Step 3/3: Executing approved trades...');
        const { data: execData } = await supabase.functions.invoke('arb-auto-execute');
        
        if (execData?.safe_mode_triggered) {
          toast.warning('Safe mode triggered during execution');
        } else {
          toast.success(`Complete! Approved: ${decisionData.approved_count}, Executed: ${execData?.executed_count || 0}`);
        }
      } else {
        toast.info('Complete! No opportunities approved for execution.');
      }
      
      setLastScanTime(new Date());
      fetchData();
    } catch (error) {
      console.error('Error running all engines:', error);
      toast.error('Failed to run automation pipeline');
    } finally {
      setRunningAll(false);
    }
  };

  // Check wallet balances and create refill requests
  const checkWalletBalances = async () => {
    setCheckingWallets(true);
    try {
      toast.info('Checking wallet balances...');
      
      // First refresh balances
      await supabase.functions.invoke('refresh-fee-payer-balances');
      await supabase.functions.invoke('refresh-evm-fee-payer-balances');
      
      // Then check for low balances and create requests
      const { data, error } = await supabase.functions.invoke('wallet-auto-refill');
      
      if (error) throw error;
      
      toast.success(`Wallet check complete: ${data.requests_created || 0} refill requests created`);
      fetchData();
    } catch (error) {
      console.error('Error checking wallets:', error);
      toast.error('Failed to check wallet balances');
    } finally {
      setCheckingWallets(false);
    }
  };

  // Run full automated cycle via orchestrator (same as cron)
  const runFullCycle = async () => {
    setRunningCycle(true);
    try {
      toast.info('Running full automated cycle (Scan → Decide → Execute → Wallet Check)...');
      
      const { data, error } = await supabase.functions.invoke('arb-cron-orchestrator');
      
      if (error) throw error;
      
      const summary = data?.summary;
      if (data?.status === 'SKIPPED') {
        toast.info(data.message || 'Cycle skipped');
      } else if (data?.status === 'SUCCESS') {
        toast.success(`Cycle complete! Scanned: ${(summary?.solana_opportunities || 0) + (summary?.evm_opportunities || 0)}, Approved: ${summary?.approved || 0}, Executed: ${summary?.executed || 0}`);
      } else {
        toast.warning(`Cycle partially complete: ${data?.status}`);
      }
      
      setLastScanTime(new Date());
      fetchData();
    } catch (error) {
      console.error('Error running full cycle:', error);
      toast.error('Failed to run full cycle');
    } finally {
      setRunningCycle(false);
    }
  };

  const toggleErrorExpanded = (runId: string) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  // Filter opportunities based on selection
  const getFilteredRuns = () => {
    const simulated = runs.filter(r => r.status === 'SIMULATED');
    
    switch (opportunityFilter) {
      case 'errors':
        return simulated.filter(r => r.error_message);
      case 'profitable':
        return simulated.filter(r => r.estimated_profit_lamports > 0 && !r.error_message);
      case 'approved':
        return simulated.filter(r => r.approved_for_auto_execution);
      default:
        return simulated;
    }
  };

  // Calculate today's stats
  const todayPnl = dailyLimits.reduce((sum, l) => sum + (l.total_pnl_native || 0), 0);
  const todayTrades = dailyLimits.reduce((sum, l) => sum + (l.total_trades || 0), 0);

  const simulatedRuns = runs.filter(r => r.status === 'SIMULATED');
  const errorRuns = simulatedRuns.filter(r => r.error_message);
  const profitableRuns = simulatedRuns.filter(r => r.estimated_profit_lamports > 0 && !r.error_message);
  const approvedRuns = runs.filter(r => r.approved_for_auto_execution && r.status === 'SIMULATED');
  const executedRuns = runs.filter(r => r.status === 'EXECUTED');
  const failedRuns = runs.filter(r => r.status === 'FAILED');
  const filteredSimulatedRuns = getFilteredRuns();

  if (authLoading || loading) {
    return (
      <DashboardLayout title="Automated Arbitrage">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Automated Arbitrage" subtitle="Internal cost optimization & fee payer management">
      <div className="space-y-6">
        {/* Real Trading Status */}
        <Alert className="border-primary/50 bg-primary/5">
          <Zap className="h-4 w-4 text-primary" />
          <AlertTitle>Real Testnet Trading Enabled</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              <strong>EVM (Real Trades):</strong> Uses 0x API for real DEX trades on Polygon, Ethereum, Arbitrum, BSC (mainnets & testnets).
              Trades execute with actual transactions using OPS wallet or fee payers.
            </p>
            <p>
              <strong>Solana (Mock Only):</strong> Jupiter API has DNS issues in edge functions. Solana scans use mock prices.
              Real Solana trades require mainnet Jupiter which isn't accessible from edge functions.
            </p>
            <div className="mt-2 flex gap-2">
              <Badge variant="default">EVM: Real Trades</Badge>
              <Badge variant="secondary">Solana: Mock Prices</Badge>
            </div>
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => runScan()} disabled={scanning}>
              {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Scan All
            </Button>
            <Button variant="outline" onClick={() => runScan('SOLANA')} disabled={scanning}>
              Scan Solana
            </Button>
            <Button variant="ghost" onClick={() => runScan('SOLANA', true)} disabled={scanning} className="text-muted-foreground">
              Scan Solana (Mock)
            </Button>
            <Button variant="outline" onClick={() => runScan('EVM')} disabled={scanning}>
              Scan EVM
            </Button>
            <Button variant="outline" onClick={checkWalletBalances} disabled={checkingWallets}>
              {checkingWallets ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wallet className="h-4 w-4 mr-2" />}
              Check Wallets
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" onClick={runDecisionEngine}>
              <Settings className="h-4 w-4 mr-2" />
              Decision Engine
            </Button>
            <Button 
              variant="outline" 
              onClick={runExecutionEngine} 
              disabled={!settings?.auto_arbitrage_enabled || settings?.safe_mode_enabled}
            >
              <Play className="h-4 w-4 mr-2" />
              Execute
            </Button>
            <Button onClick={() => runAllEngines()} disabled={runningAll || settings?.safe_mode_enabled}>
              {runningAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Run All Engines
            </Button>
          </div>
        </div>

        {/* Last Scan Time */}
        {lastScanTime && (
          <div className="text-sm text-muted-foreground">
            Last scan: {lastScanTime.toLocaleString()}
          </div>
        )}

        {/* Safe Mode Alert */}
        {settings?.safe_mode_enabled && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-8 w-8 text-destructive" />
                  <div>
                    <h3 className="font-semibold text-destructive">Safe Mode Active</h3>
                    <p className="text-sm text-muted-foreground">
                      {settings.safe_mode_reason || 'Auto-execution is paused. Manual review required.'}
                    </p>
                    {settings.safe_mode_triggered_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Triggered: {new Date(settings.safe_mode_triggered_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="destructive" 
                  onClick={() => updateSystemSetting('safe_mode_enabled', false)}
                  disabled={updating}
                >
                  Disable Safe Mode
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 1: Overview */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Auto Arbitrage</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {settings?.auto_arbitrage_enabled ? 'Enabled' : 'Disabled'}
                </span>
                <Switch
                  checked={settings?.auto_arbitrage_enabled || false}
                  onCheckedChange={(checked) => updateSystemSetting('auto_arbitrage_enabled', checked)}
                  disabled={updating}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cron Schedule</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Every 5 min</div>
              <p className="text-xs text-muted-foreground">
                Last: {automationLogs[0] ? new Date(automationLogs[0].cycle_started_at).toLocaleTimeString() : 'N/A'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's PnL</CardTitle>
              {todayPnl >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${todayPnl >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                {todayPnl >= 0 ? '+' : ''}{(todayPnl / 1e9).toFixed(4)}
              </div>
              <p className="text-xs text-muted-foreground">in native token units (Gwei/lamports)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Trades</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todayTrades}</div>
              <p className="text-xs text-muted-foreground">
                Max: {settings?.max_global_trades_per_day || 50}/day
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Refills</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{refillRequests.length}</div>
              <p className="text-xs text-muted-foreground">wallets need funding</p>
            </CardContent>
          </Card>
        </div>

        {/* PnL Trends Chart */}
        <PnLTrendsChart runs={runs} strategies={strategies} />

        <Tabs defaultValue="opportunities" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="opportunities">
              Opportunities ({simulatedRuns.length})
              {errorRuns.length > 0 && (
                <Badge variant="destructive" className="ml-2">{errorRuns.length} errors</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="executed">
              Executed ({executedRuns.length})
            </TabsTrigger>
            <TabsTrigger value="strategies">
              Strategy Controls ({strategies.length})
            </TabsTrigger>
            <TabsTrigger value="refills">
              Refill Requests ({refillRequests.length})
            </TabsTrigger>
            <TabsTrigger value="automation">
              <History className="h-4 w-4 mr-1" />
              Automation Logs ({automationLogs.length})
            </TabsTrigger>
          </TabsList>

          {/* Section 3: Opportunities */}
          <TabsContent value="opportunities">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Simulated Opportunities</CardTitle>
                    <CardDescription>Pending arbitrage opportunities awaiting approval or execution</CardDescription>
                  </div>
                  <Select value={opportunityFilter} onValueChange={(v) => setOpportunityFilter(v as OpportunityFilter)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ({simulatedRuns.length})</SelectItem>
                      <SelectItem value="profitable">Profitable ({profitableRuns.length})</SelectItem>
                      <SelectItem value="approved">Approved ({approvedRuns.length})</SelectItem>
                      <SelectItem value="errors">Errors ({errorRuns.length})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Strategy</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Est. Profit</TableHead>
                      <TableHead>Gas Cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSimulatedRuns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No opportunities matching filter
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSimulatedRuns.slice(0, 30).map((run) => {
                        const strategy = strategies.find(s => s.id === run.strategy_id);
                        const hasError = !!run.error_message;
                        const isExpanded = expandedErrors.has(run.id);
                        
                        return (
                          <Collapsible key={run.id} asChild open={isExpanded}>
                            <>
                              <TableRow className={hasError ? 'bg-destructive/5' : ''}>
                                <TableCell className="font-medium">
                                  {strategy?.name || 'Unknown'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {strategy?.chain_type}
                                  </Badge>
                                  {strategy?.evm_network && (
                                    <Badge variant="secondary" className="ml-1">
                                      {strategy.evm_network}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={
                                    run.purpose === 'FEE_PAYER_REFILL' ? 'default' :
                                    run.purpose === 'OPS_REFILL' ? 'secondary' : 'outline'
                                  }>
                                    {run.purpose || 'MANUAL'}
                                  </Badge>
                                </TableCell>
                                <TableCell className={hasError ? 'text-muted-foreground' : 'text-green-500'}>
                                  {hasError ? '-' : `+${(run.estimated_profit_lamports / 1e9).toFixed(6)}`}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {run.estimated_gas_cost_native ? (run.estimated_gas_cost_native / 1e9).toFixed(6) : '-'}
                                </TableCell>
                                <TableCell>
                                  {hasError ? (
                                    <CollapsibleTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="text-destructive p-0 h-auto"
                                        onClick={() => toggleErrorExpanded(run.id)}
                                      >
                                        <XCircle className="h-4 w-4 mr-1" />
                                        Error
                                        {isExpanded ? <ChevronDown className="h-3 w-3 ml-1" /> : <ChevronRight className="h-3 w-3 ml-1" />}
                                      </Button>
                                    </CollapsibleTrigger>
                                  ) : run.approved_for_auto_execution ? (
                                    <Badge className="bg-green-500">Approved</Badge>
                                  ) : (
                                    <Badge variant="outline">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Pending
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {new Date(run.created_at).toLocaleString()}
                                </TableCell>
                              </TableRow>
                              {hasError && (
                                <CollapsibleContent asChild>
                                  <TableRow>
                                    <TableCell colSpan={7} className="bg-destructive/5 py-2">
                                      <div className="text-sm text-destructive font-mono px-4">
                                        {run.error_message}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                </CollapsibleContent>
                              )}
                            </>
                          </Collapsible>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Section 4: Executed Trades */}
          <TabsContent value="executed">
            <Card>
              <CardHeader>
                <CardTitle>Executed Trades</CardTitle>
                <CardDescription>Completed arbitrage executions with results</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Strategy</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>PnL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>TX</TableHead>
                      <TableHead>Executed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...executedRuns, ...failedRuns].length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No executed trades yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      [...executedRuns, ...failedRuns].slice(0, 30).map((run) => {
                        const strategy = strategies.find(s => s.id === run.strategy_id);
                        const pnl = run.actual_profit_lamports || 0;
                        const chain = strategy?.chain_type || 'SOLANA';
                        const network = strategy?.evm_network || chain;
                        const explorerUrl = EXPLORER_URLS[network] || EXPLORER_URLS.SOLANA;

                        return (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium">
                              {strategy?.name || 'Unknown'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{chain}</Badge>
                              {strategy?.evm_network && (
                                <Badge variant="secondary" className="ml-1">{strategy.evm_network}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {run.auto_executed ? (
                                <Badge variant="secondary">Auto</Badge>
                              ) : (
                                <Badge variant="outline">Manual</Badge>
                              )}
                            </TableCell>
                            <TableCell className={pnl >= 0 ? 'text-green-500' : 'text-destructive'}>
                              {pnl >= 0 ? '+' : ''}{(pnl / 1e9).toFixed(6)}
                            </TableCell>
                            <TableCell>
                              {run.status === 'EXECUTED' ? (
                                <Badge className="bg-green-500">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Success
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Failed
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {run.tx_signature ? (
                                <a 
                                  href={`${explorerUrl}${run.tx_signature}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                >
                                  {run.tx_signature.slice(0, 8)}...
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {run.finished_at ? new Date(run.finished_at).toLocaleString() : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Section 5: Strategy Risk Controls */}
          <TabsContent value="strategies">
            <Card>
              <CardHeader>
                <CardTitle>Strategy Risk Controls</CardTitle>
                <CardDescription>Configure automation settings and risk thresholds per strategy</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {strategies.map((strategy) => {
                    const strategyRuns = runs.filter(r => r.strategy_id === strategy.id);
                    const strategyErrors = strategyRuns.filter(r => r.error_message);
                    
                    return (
                      <div key={strategy.id} className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold flex items-center gap-2">
                              {strategy.name}
                              <Badge variant="outline">{strategy.chain_type}</Badge>
                              {strategy.evm_network && (
                                <Badge variant="secondary">{strategy.evm_network}</Badge>
                              )}
                              {strategyErrors.length > 0 && (
                                <Badge variant="destructive">{strategyErrors.length} errors</Badge>
                              )}
                            </h3>
                            <div className="flex gap-2 mt-1">
                              {strategy.is_for_fee_payer_refill && (
                                <Badge className="bg-blue-500">Fee Payer Refill</Badge>
                              )}
                              {strategy.is_for_ops_refill && (
                                <Badge className="bg-purple-500">OPS Refill</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                const chain = strategy.chain_type === 'SOLANA' ? 'SOLANA' : 'EVM';
                                runScan(chain as 'SOLANA' | 'EVM');
                              }}
                              disabled={scanning}
                            >
                              <Search className="h-4 w-4 mr-1" />
                              Scan
                            </Button>
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`auto-${strategy.id}`} className="text-sm">
                                Auto-Execute
                              </Label>
                              <Switch
                                id={`auto-${strategy.id}`}
                                checked={strategy.is_auto_enabled}
                                onCheckedChange={(checked) => 
                                  updateStrategy(strategy.id, { is_auto_enabled: checked })
                                }
                                disabled={updating}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Min Profit (native)</Label>
                            <Input
                              type="number"
                              value={strategy.min_expected_profit_native}
                              onChange={(e) => 
                                updateStrategy(strategy.id, { 
                                  min_expected_profit_native: parseInt(e.target.value) || 0 
                                })
                              }
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Min Profit/Gas Ratio</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={strategy.min_profit_to_gas_ratio}
                              onChange={(e) => 
                                updateStrategy(strategy.id, { 
                                  min_profit_to_gas_ratio: parseFloat(e.target.value) || 1 
                                })
                              }
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Max Daily Loss</Label>
                            <Input
                              type="number"
                              value={strategy.max_daily_loss_native}
                              onChange={(e) => 
                                updateStrategy(strategy.id, { 
                                  max_daily_loss_native: parseInt(e.target.value) || 0 
                                })
                              }
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Max Trades/Day</Label>
                            <Input
                              type="number"
                              value={strategy.max_trades_per_day}
                              onChange={(e) => 
                                updateStrategy(strategy.id, { 
                                  max_trades_per_day: parseInt(e.target.value) || 10 
                                })
                              }
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Max Trade Value</Label>
                            <Input
                              type="number"
                              value={strategy.max_trade_value_native || ''}
                              placeholder="No limit"
                              onChange={(e) => 
                                updateStrategy(strategy.id, { 
                                  max_trade_value_native: e.target.value ? parseInt(e.target.value) : null 
                                })
                              }
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Section 2: Refill Requests */}
          <TabsContent value="refills">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Pending Refill Requests</CardTitle>
                    <CardDescription>Wallets requiring funding for transaction fees</CardDescription>
                  </div>
                  <Button variant="outline" onClick={checkWalletBalances} disabled={checkingWallets}>
                    {checkingWallets ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Check All Wallets
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wallet Type</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refillRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No pending refill requests
                        </TableCell>
                      </TableRow>
                    ) : (
                      refillRequests.map((req) => (
                        <TableRow key={req.id}>
                          <TableCell>
                            <Badge variant="outline">{req.wallet_type}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {req.wallet_address.slice(0, 8)}...{req.wallet_address.slice(-6)}
                          </TableCell>
                          <TableCell>{req.chain}</TableCell>
                          <TableCell>
                            <Badge variant={
                              req.reason === 'FEE_PAYER_LOW_BALANCE' ? 'default' : 'secondary'
                            }>
                              {req.reason}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              <Clock className="h-3 w-3 mr-1" />
                              {req.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(req.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Section 6: Automation Logs */}
          <TabsContent value="automation">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Timer className="h-5 w-5" />
                      Automation Logs
                    </CardTitle>
                    <CardDescription>
                      Cron job runs every 5 minutes: Scan → Decide → Execute → Wallet Check
                    </CardDescription>
                  </div>
                  <Button onClick={runFullCycle} disabled={runningCycle}>
                    {runningCycle ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                    Run Full Cycle Now
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Solana</TableHead>
                      <TableHead>EVM</TableHead>
                      <TableHead>Approved</TableHead>
                      <TableHead>Executed</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {automationLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No automation cycles recorded yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      automationLogs.map((log) => {
                        const scanSolana = log.scan_solana_result as { data?: { simulations?: unknown[] } } | null;
                        const scanEvm = log.scan_evm_result as { data?: { simulations?: unknown[] } } | null;
                        const decision = log.decision_result as { data?: { approved_count?: number } } | null;
                        const execution = log.execution_result as { data?: { executed_count?: number } } | null;
                        
                        const durationMs = log.cycle_finished_at 
                          ? new Date(log.cycle_finished_at).getTime() - new Date(log.cycle_started_at).getTime()
                          : null;
                        
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="text-muted-foreground">
                              {new Date(log.cycle_started_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant={log.trigger_type === 'cron' ? 'secondary' : 'outline'}>
                                {log.trigger_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                log.overall_status === 'SUCCESS' ? 'default' :
                                log.overall_status === 'PARTIAL' ? 'secondary' :
                                log.overall_status === 'SKIPPED' ? 'outline' :
                                log.overall_status === 'RUNNING' ? 'outline' :
                                'destructive'
                              }>
                                {log.overall_status === 'SUCCESS' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                {log.overall_status === 'FAILED' && <XCircle className="h-3 w-3 mr-1" />}
                                {log.overall_status === 'RUNNING' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                {log.overall_status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {scanSolana?.data?.simulations?.length ?? '-'}
                            </TableCell>
                            <TableCell>
                              {scanEvm?.data?.simulations?.length ?? '-'}
                            </TableCell>
                            <TableCell>
                              {decision?.data?.approved_count ?? '-'}
                            </TableCell>
                            <TableCell>
                              {execution?.data?.executed_count ?? '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                {automationLogs.length > 0 && automationLogs[0].error_message && (
                  <Alert className="mt-4" variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Last Cycle Error</AlertTitle>
                    <AlertDescription className="font-mono text-sm">
                      {automationLogs[0].error_message}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
