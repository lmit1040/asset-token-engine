import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Activity, ExternalLink, AlertTriangle, RefreshCw, Shield, ShieldOff, Filter, Bell, Lock, Unlock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface OpsArbitrageEvent {
  id: string;
  chain: string;
  network: string;
  mode: string;
  notional_in: string | null;
  expected_gross_profit: string | null;
  expected_net_profit: string | null;
  realized_profit: string | null;
  gas_used: string | null;
  effective_gas_price: string | null;
  tx_hash: string | null;
  status: string;
  error_message: string | null;
  strategy_id: string | null;
  run_id: string | null;
  created_at: string;
}

interface OpsArbitrageAlert {
  id: string;
  created_at: string;
  network: string;
  chain: string;
  run_id: string | null;
  alert_type: string;
  severity: string;
  expected_net_profit: string | null;
  realized_profit: string | null;
  gas_spent: string | null;
  details_json: Record<string, any> | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

// Explorer URLs per network
const EXPLORER_URLS: Record<string, { url: string; name: string }> = {
  polygon: { url: 'https://polygonscan.com/tx/', name: 'Polygonscan' },
  ethereum: { url: 'https://etherscan.io/tx/', name: 'Etherscan' },
  arbitrum: { url: 'https://arbiscan.io/tx/', name: 'Arbiscan' },
  bsc: { url: 'https://bscscan.com/tx/', name: 'BscScan' },
  POLYGON: { url: 'https://polygonscan.com/tx/', name: 'Polygonscan' },
  ETHEREUM: { url: 'https://etherscan.io/tx/', name: 'Etherscan' },
  ARBITRUM: { url: 'https://arbiscan.io/tx/', name: 'Arbiscan' },
  BSC: { url: 'https://bscscan.com/tx/', name: 'BscScan' },
};

export default function AdminOpsArbitrageEventsPage() {
  const [events, setEvents] = useState<OpsArbitrageEvent[]>([]);
  const [alerts, setAlerts] = useState<OpsArbitrageAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [minNotional, setMinNotional] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<OpsArbitrageEvent | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<OpsArbitrageAlert | null>(null);
  const [activeTab, setActiveTab] = useState('events');
  
  // Environment status
  const [arbEnv, setArbEnv] = useState<string>('unknown');
  const [arbExecutionEnabled, setArbExecutionEnabled] = useState<boolean | null>(null);
  const [executionLocked, setExecutionLocked] = useState(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const fetchEvents = async () => {
    setIsLoading(true);

    let query = supabase
      .from('ops_arbitrage_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (selectedStatus !== 'all') {
      query = query.eq('status', selectedStatus);
    }

    if (dateFrom) {
      query = query.gte('created_at', new Date(dateFrom).toISOString());
    }

    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      toast.error('Failed to load events');
      console.error(error);
    } else {
      let filteredData = data as OpsArbitrageEvent[];
      
      if (minNotional) {
        const minValue = parseFloat(minNotional);
        if (!isNaN(minValue)) {
          filteredData = filteredData.filter(e => {
            const notional = parseFloat(e.notional_in || '0');
            return notional >= minValue;
          });
        }
      }
      
      setEvents(filteredData);
    }
    setIsLoading(false);
  };

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('ops_arbitrage_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to load alerts:', error);
    } else {
      setAlerts(data as OpsArbitrageAlert[]);
    }
  };

  const fetchEnvStatus = async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('is_mainnet_mode, auto_arbitrage_enabled, arb_execution_locked, arb_execution_locked_reason')
        .single();
      
      if (data) {
        setArbEnv(data.is_mainnet_mode ? 'mainnet' : 'testnet');
        setArbExecutionEnabled(data.auto_arbitrage_enabled);
        setExecutionLocked(data.arb_execution_locked || false);
        setLockReason(data.arb_execution_locked_reason || null);
      }
    } catch (err) {
      console.error('Failed to fetch env status:', err);
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchAlerts();
    fetchEnvStatus();
  }, [selectedStatus, dateFrom, dateTo]);

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Not authenticated');
        return;
      }

      // First, get the system settings id
      const { data: settings } = await supabase
        .from('system_settings')
        .select('id')
        .limit(1)
        .single();

      if (!settings) {
        toast.error('System settings not found');
        return;
      }

      // Unlock execution
      const { error } = await supabase
        .from('system_settings')
        .update({
          arb_execution_locked: false,
          arb_execution_locked_at: null,
          arb_execution_locked_reason: null,
        })
        .eq('id', settings.id);

      if (error) {
        toast.error('Failed to unlock: ' + error.message);
        return;
      }

      // Acknowledge all unacknowledged alerts
      await supabase
        .from('ops_arbitrage_alerts')
        .update({
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString(),
        })
        .is('acknowledged_at', null);

      toast.success('Execution unlocked and alerts acknowledged');
      setExecutionLocked(false);
      setLockReason(null);
      fetchAlerts();
    } catch (err) {
      console.error('Unlock error:', err);
      toast.error('Failed to unlock');
    } finally {
      setUnlocking(false);
    }
  };

  const formatWei = (wei: string | null) => {
    if (!wei) return '-';
    const value = parseFloat(wei);
    if (isNaN(value)) return wei;
    return (value / 1e18).toFixed(6);
  };

  const formatGwei = (wei: string | null) => {
    if (!wei) return '-';
    const value = parseFloat(wei);
    if (isNaN(value)) return wei;
    return (value / 1e9).toFixed(2);
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status.toUpperCase()) {
      case 'EXECUTED': return 'default';
      case 'SIMULATED': return 'secondary';
      case 'FAILED':
      case 'ABORTED':
      case 'REJECTED': return 'destructive';
      default: return 'outline';
    }
  };

  const getSeverityVariant = (severity: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary';
      case 'info': return 'outline';
      default: return 'outline';
    }
  };

  const getExplorerUrl = (txHash: string, network: string) => {
    const explorer = EXPLORER_URLS[network] || EXPLORER_URLS.polygon;
    return `${explorer.url}${txHash}`;
  };

  const clearFilters = () => {
    setSelectedStatus('all');
    setMinNotional('');
    setDateFrom('');
    setDateTo('');
  };

  // Stats
  const stats = {
    total: events.length,
    executed: events.filter(e => e.status === 'EXECUTED').length,
    simulated: events.filter(e => e.status === 'SIMULATED').length,
    failed: events.filter(e => ['FAILED', 'ABORTED', 'REJECTED'].includes(e.status)).length,
    totalRealizedProfit: events
      .filter(e => e.status === 'EXECUTED' && e.realized_profit)
      .reduce((sum, e) => sum + parseFloat(e.realized_profit || '0'), 0),
  };

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged_at);
  const criticalAlerts = unacknowledgedAlerts.filter(a => a.severity === 'critical');

  return (
    <DashboardLayout title="OPS Arbitrage Events" subtitle="Real-time monitoring of EVM arbitrage execution (INTERNAL ONLY)">
      <div className="space-y-6">
        {/* Execution Locked Banner */}
        {executionLocked && (
          <Alert className="border-destructive bg-destructive/10">
            <Lock className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-destructive flex items-center justify-between">
              <div>
                <strong>EXECUTION LOCKED</strong>
                {lockReason && <span className="ml-2">- {lockReason}</span>}
              </div>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleUnlock}
                disabled={unlocking}
              >
                {unlocking ? 'Unlocking...' : 'Acknowledge & Unlock'}
                <Unlock className="ml-2 h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Environment Status Banner */}
        <Alert className={arbExecutionEnabled ? "border-green-500 bg-green-500/10" : "border-amber-500 bg-amber-500/10"}>
          {arbExecutionEnabled ? (
            <Shield className="h-4 w-4 text-green-500" />
          ) : (
            <ShieldOff className="h-4 w-4 text-amber-500" />
          )}
          <AlertDescription className={arbExecutionEnabled ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}>
            <div className="flex items-center gap-4 flex-wrap">
              <span>
                <strong>ARB_ENV:</strong> {arbEnv.toUpperCase()}
              </span>
              <span>
                <strong>ARB_EXECUTION_ENABLED:</strong>{' '}
                <Badge variant={arbExecutionEnabled ? 'default' : 'destructive'}>
                  {arbExecutionEnabled ? 'TRUE' : 'FALSE'}
                </Badge>
              </span>
              {unacknowledgedAlerts.length > 0 && (
                <Badge variant="destructive" className="animate-pulse">
                  <Bell className="h-3 w-3 mr-1" />
                  {unacknowledgedAlerts.length} Unacknowledged Alerts
                </Badge>
              )}
            </div>
          </AlertDescription>
        </Alert>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Events</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Executed</CardDescription>
              <CardTitle className="text-2xl text-green-600">{stats.executed}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Simulated</CardDescription>
              <CardTitle className="text-2xl text-blue-600">{stats.simulated}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed/Aborted</CardDescription>
              <CardTitle className="text-2xl text-destructive">{stats.failed}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader className="pb-2">
              <CardDescription>Total Realized Profit</CardDescription>
              <CardTitle className="text-2xl text-green-600 font-mono">
                {formatWei(stats.totalRealizedProfit.toString())} POL
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs for Events and Alerts */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Alerts
              {unacknowledgedAlerts.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {unacknowledgedAlerts.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Filter className="h-4 w-4" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm">Status</Label>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="SIMULATED">Simulated</SelectItem>
                        <SelectItem value="EXECUTED">Executed</SelectItem>
                        <SelectItem value="FAILED">Failed</SelectItem>
                        <SelectItem value="ABORTED">Aborted</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm">Min Notional (wei)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 1000000000000000000"
                      value={minNotional}
                      onChange={(e) => setMinNotional(e.target.value)}
                      className="w-56"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm">From Date</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-40"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm">To Date</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-40"
                    />
                  </div>

                  <Button variant="outline" onClick={fetchEvents}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>

                  <Button variant="ghost" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Events Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Event History (Last 50)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : events.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No events found. Execute an arbitrage to see events here.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Created</TableHead>
                          <TableHead>Network</TableHead>
                          <TableHead>Mode</TableHead>
                          <TableHead className="text-right">Notional</TableHead>
                          <TableHead className="text-right">Exp. Gross</TableHead>
                          <TableHead className="text-right">Exp. Net</TableHead>
                          <TableHead className="text-right">Realized</TableHead>
                          <TableHead className="text-right">Gas Spent</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>TX Hash</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {events.map((event) => (
                          <TableRow 
                            key={event.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedEvent(event)}
                          >
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(event.created_at), 'MMM d, HH:mm:ss')}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{event.network.toUpperCase()}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={event.mode === 'OPS_REFILL' ? 'default' : 'secondary'}>
                                {event.mode}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatWei(event.notional_in)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatWei(event.expected_gross_profit)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatWei(event.expected_net_profit)}
                            </TableCell>
                            <TableCell className={`text-right font-mono text-sm ${
                              event.realized_profit && parseFloat(event.realized_profit) > 0 
                                ? 'text-green-600' 
                                : event.realized_profit && parseFloat(event.realized_profit) < 0 
                                  ? 'text-destructive' 
                                  : ''
                            }`}>
                              {formatWei(event.realized_profit)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {event.gas_used && event.effective_gas_price 
                                ? formatWei((BigInt(event.gas_used) * BigInt(event.effective_gas_price)).toString())
                                : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusVariant(event.status)}>
                                {event.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {event.tx_hash ? (
                                <a 
                                  href={getExplorerUrl(event.tx_hash.split(',')[0], event.network)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {event.tx_hash.slice(0, 8)}...
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            {/* Alerts Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Alerts</CardDescription>
                  <CardTitle className="text-2xl">{alerts.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card className={criticalAlerts.length > 0 ? "border-destructive" : ""}>
                <CardHeader className="pb-2">
                  <CardDescription>Critical (Unacked)</CardDescription>
                  <CardTitle className="text-2xl text-destructive">{criticalAlerts.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Warning (Unacked)</CardDescription>
                  <CardTitle className="text-2xl text-amber-600">
                    {unacknowledgedAlerts.filter(a => a.severity === 'warning').length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Acknowledged</CardDescription>
                  <CardTitle className="text-2xl text-green-600">
                    {alerts.filter(a => a.acknowledged_at).length}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Alerts Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Alert History (Last 50)
                </CardTitle>
                <Button variant="outline" size="sm" onClick={fetchAlerts}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {alerts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No alerts found. Alerts are created when PnL discrepancies are detected.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Created</TableHead>
                          <TableHead>Network</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead className="text-right">Expected</TableHead>
                          <TableHead className="text-right">Realized</TableHead>
                          <TableHead className="text-right">Gas Spent</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alerts.map((alert) => (
                          <TableRow 
                            key={alert.id} 
                            className={`cursor-pointer hover:bg-muted/50 ${!alert.acknowledged_at ? 'bg-destructive/5' : ''}`}
                            onClick={() => setSelectedAlert(alert)}
                          >
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(alert.created_at), 'MMM d, HH:mm:ss')}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{alert.network.toUpperCase()}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {alert.alert_type}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getSeverityVariant(alert.severity)}>
                                {alert.severity.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatWei(alert.expected_net_profit)}
                            </TableCell>
                            <TableCell className={`text-right font-mono text-sm ${
                              alert.realized_profit && parseFloat(alert.realized_profit) < 0 
                                ? 'text-destructive' 
                                : ''
                            }`}>
                              {formatWei(alert.realized_profit)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatWei(alert.gas_spent)}
                            </TableCell>
                            <TableCell>
                              {alert.acknowledged_at ? (
                                <Badge variant="outline" className="text-green-600">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Acked
                                </Badge>
                              ) : (
                                <Badge variant="destructive">Pending</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Event Detail Dialog */}
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Event Details</DialogTitle>
            </DialogHeader>
            {selectedEvent && (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 pr-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">ID</p>
                      <p className="font-mono text-sm">{selectedEvent.id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p>{format(new Date(selectedEvent.created_at), 'PPpp')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Chain</p>
                      <p>{selectedEvent.chain}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Network</p>
                      <Badge variant="outline">{selectedEvent.network.toUpperCase()}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Mode</p>
                      <Badge variant={selectedEvent.mode === 'OPS_REFILL' ? 'default' : 'secondary'}>
                        {selectedEvent.mode}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant={getStatusVariant(selectedEvent.status)}>{selectedEvent.status}</Badge>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Profit Waterfall</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Notional In</p>
                        <p className="font-mono">{formatWei(selectedEvent.notional_in)} POL</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Expected Gross Profit</p>
                        <p className="font-mono">{formatWei(selectedEvent.expected_gross_profit)} POL</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Expected Net Profit</p>
                        <p className="font-mono">{formatWei(selectedEvent.expected_net_profit)} POL</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Realized Profit</p>
                        <p className={`font-mono ${
                          selectedEvent.realized_profit && parseFloat(selectedEvent.realized_profit) > 0 
                            ? 'text-green-600' 
                            : selectedEvent.realized_profit && parseFloat(selectedEvent.realized_profit) < 0 
                              ? 'text-destructive' 
                              : ''
                        }`}>
                          {formatWei(selectedEvent.realized_profit)} POL
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Gas Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Gas Used</p>
                        <p className="font-mono">{selectedEvent.gas_used || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Effective Gas Price</p>
                        <p className="font-mono">{formatGwei(selectedEvent.effective_gas_price)} gwei</p>
                      </div>
                    </div>
                  </div>

                  {selectedEvent.tx_hash && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2">Transaction</h4>
                      <a 
                        href={getExplorerUrl(selectedEvent.tx_hash.split(',')[0], selectedEvent.network)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        {selectedEvent.tx_hash}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  {selectedEvent.error_message && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2 text-destructive">Error</h4>
                      <p className="text-sm text-destructive bg-destructive/10 p-3 rounded">
                        {selectedEvent.error_message}
                      </p>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Raw JSON</h4>
                    <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                      {JSON.stringify(selectedEvent, null, 2)}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>

        {/* Alert Detail Dialog */}
        <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Alert Details
              </DialogTitle>
              <DialogDescription>
                {selectedAlert?.alert_type} - {selectedAlert?.severity.toUpperCase()}
              </DialogDescription>
            </DialogHeader>
            {selectedAlert && (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 pr-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p>{format(new Date(selectedAlert.created_at), 'PPpp')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Severity</p>
                      <Badge variant={getSeverityVariant(selectedAlert.severity)}>
                        {selectedAlert.severity.toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Network</p>
                      <Badge variant="outline">{selectedAlert.network.toUpperCase()}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      {selectedAlert.acknowledged_at ? (
                        <Badge variant="outline" className="text-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Acknowledged
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Pending</Badge>
                      )}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">PnL Comparison</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Expected Net</p>
                        <p className="font-mono">{formatWei(selectedAlert.expected_net_profit)} POL</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Realized</p>
                        <p className={`font-mono ${
                          selectedAlert.realized_profit && parseFloat(selectedAlert.realized_profit) < 0 
                            ? 'text-destructive' 
                            : ''
                        }`}>
                          {formatWei(selectedAlert.realized_profit)} POL
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Gas Spent</p>
                        <p className="font-mono">{formatWei(selectedAlert.gas_spent)} POL</p>
                      </div>
                    </div>
                  </div>

                  {selectedAlert.details_json && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2">Details</h4>
                      <div className="bg-muted p-3 rounded space-y-2">
                        {selectedAlert.details_json.reason && (
                          <p className="text-sm"><strong>Reason:</strong> {selectedAlert.details_json.reason}</p>
                        )}
                        {selectedAlert.details_json.pnl_ratio !== undefined && (
                          <p className="text-sm"><strong>PnL Ratio:</strong> {(selectedAlert.details_json.pnl_ratio * 100).toFixed(1)}%</p>
                        )}
                        {selectedAlert.details_json.pnl_delta && (
                          <p className="text-sm"><strong>PnL Delta:</strong> {formatWei(selectedAlert.details_json.pnl_delta)} POL</p>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedAlert.acknowledged_at && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2 text-green-600">Acknowledgment</h4>
                      <p className="text-sm">
                        Acknowledged at {format(new Date(selectedAlert.acknowledged_at), 'PPpp')}
                      </p>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Raw JSON</h4>
                    <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                      {JSON.stringify(selectedAlert, null, 2)}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
