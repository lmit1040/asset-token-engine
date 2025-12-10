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
  DollarSign
} from 'lucide-react';

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

const EXPLORER_URLS: Record<string, string> = {
  SOLANA: 'https://solscan.io/tx/',
  POLYGON: 'https://polygonscan.com/tx/',
  ETHEREUM: 'https://etherscan.io/tx/',
  ARBITRUM: 'https://arbiscan.io/tx/',
  BSC: 'https://bscscan.com/tx/',
};

export default function AdminAutomatedArbitragePage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [strategies, setStrategies] = useState<ArbitrageStrategy[]>([]);
  const [runs, setRuns] = useState<ArbitrageRun[]>([]);
  const [dailyLimits, setDailyLimits] = useState<DailyRiskLimit[]>([]);
  const [refillRequests, setRefillRequests] = useState<WalletRefillRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

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
        .limit(50);
      
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

  const runDecisionEngine = async () => {
    try {
      toast.info('Running decision engine...');
      const { data, error } = await supabase.functions.invoke('arb-auto-controller');
      
      if (error) throw error;
      
      toast.success(`Decision engine: ${data.approved_count} runs approved`);
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
        toast.success(`Execution: ${data.executed_count} trades executed`);
      }
      fetchData();
    } catch (error) {
      console.error('Error running execution engine:', error);
      toast.error('Failed to run execution engine');
    }
  };

  // Calculate today's stats
  const todayPnl = dailyLimits.reduce((sum, l) => sum + (l.total_pnl_native || 0), 0);
  const todayTrades = dailyLimits.reduce((sum, l) => sum + (l.total_trades || 0), 0);
  const todayLoss = dailyLimits.reduce((sum, l) => sum + (l.total_loss_native || 0), 0);

  const simulatedRuns = runs.filter(r => r.status === 'SIMULATED');
  const approvedRuns = runs.filter(r => r.approved_for_auto_execution && r.status === 'SIMULATED');
  const executedRuns = runs.filter(r => r.status === 'EXECUTED');
  const failedRuns = runs.filter(r => r.status === 'FAILED');

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
        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={runDecisionEngine}>
            <Settings className="h-4 w-4 mr-2" />
            Run Decision Engine
          </Button>
          <Button onClick={runExecutionEngine} disabled={!settings?.auto_arbitrage_enabled || settings?.safe_mode_enabled}>
            <Play className="h-4 w-4 mr-2" />
            Run Execution Engine
          </Button>
        </div>

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
        <div className="grid gap-4 md:grid-cols-4">
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

        <Tabs defaultValue="opportunities" className="space-y-4">
          <TabsList>
            <TabsTrigger value="opportunities">
              Opportunities ({simulatedRuns.length})
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
          </TabsList>

          {/* Section 3: Opportunities */}
          <TabsContent value="opportunities">
            <Card>
              <CardHeader>
                <CardTitle>Simulated Opportunities</CardTitle>
                <CardDescription>Pending arbitrage opportunities awaiting approval or execution</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Strategy</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Est. Profit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simulatedRuns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No pending opportunities
                        </TableCell>
                      </TableRow>
                    ) : (
                      simulatedRuns.slice(0, 20).map((run) => {
                        const strategy = strategies.find(s => s.id === run.strategy_id);
                        return (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium">
                              {strategy?.name || 'Unknown'}
                              <Badge variant="outline" className="ml-2">
                                {strategy?.chain_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                run.purpose === 'FEE_PAYER_REFILL' ? 'default' :
                                run.purpose === 'OPS_REFILL' ? 'secondary' : 'outline'
                              }>
                                {run.purpose || 'MANUAL'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-green-500">
                              +{(run.estimated_profit_lamports / 1e9).toFixed(6)}
                            </TableCell>
                            <TableCell>
                              {run.approved_for_auto_execution ? (
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
                      <TableHead>Type</TableHead>
                      <TableHead>PnL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>TX</TableHead>
                      <TableHead>Executed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...executedRuns, ...failedRuns].slice(0, 30).map((run) => {
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
                    })}
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
                  {strategies.map((strategy) => (
                    <div key={strategy.id} className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold flex items-center gap-2">
                            {strategy.name}
                            <Badge variant="outline">{strategy.chain_type}</Badge>
                            {strategy.evm_network && (
                              <Badge variant="secondary">{strategy.evm_network}</Badge>
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
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Section 2: Refill Requests */}
          <TabsContent value="refills">
            <Card>
              <CardHeader>
                <CardTitle>Pending Refill Requests</CardTitle>
                <CardDescription>Wallets requiring funding for transaction fees</CardDescription>
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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
