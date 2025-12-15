import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { 
  Globe, 
  TestTube, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
  Clock,
  Settings2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RpcConfigModal } from './RpcConfigModal';

interface NetworkModeCardProps {
  isMainnetMode: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
  isUpdating?: boolean;
}

interface RpcTestResult {
  network: string;
  name: string;
  url: string;
  urlSource: 'secret' | 'database' | 'fallback';
  isMainnet: boolean;
  status: 'ok' | 'error' | 'timeout';
  latencyMs: number | null;
  error?: string;
  blockNumber?: number | string;
}

interface RpcTestSummary {
  mainnetReady: boolean;
  mainnetOk: number;
  mainnetTotal: number;
  testnetOk: number;
  testnetTotal: number;
  avgMainnetLatency: number | null;
  avgTestnetLatency: number | null;
}

// Map network keys to display names for current mode
const NETWORK_DISPLAY_MAP: Record<string, { mainnet: string; testnet: string }> = {
  SOLANA: { mainnet: 'SOLANA_MAINNET', testnet: 'SOLANA_DEVNET' },
  POLYGON: { mainnet: 'POLYGON', testnet: 'POLYGON_AMOY' },
  ETHEREUM: { mainnet: 'ETHEREUM', testnet: 'SEPOLIA' },
  ARBITRUM: { mainnet: 'ARBITRUM', testnet: 'ARBITRUM_SEPOLIA' },
  BSC: { mainnet: 'BSC', testnet: 'BSC_TESTNET' },
};

export function NetworkModeCard({ isMainnetMode, onToggle, isUpdating }: NetworkModeCardProps) {
  const [showMainnetConfirm, setShowMainnetConfirm] = useState(false);
  const [showRpcConfig, setShowRpcConfig] = useState(false);
  const [confirmStep, setConfirmStep] = useState(1);
  const [rpcResults, setRpcResults] = useState<RpcTestResult[]>([]);
  const [rpcSummary, setRpcSummary] = useState<RpcTestSummary | null>(null);
  const [testingRpc, setTestingRpc] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<Date | null>(null);

  // Test RPC connectivity
  const testRpcConnectivity = async () => {
    setTestingRpc(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-rpc-connectivity', {
        body: { testMainnet: true, testTestnet: true }
      });
      
      if (error) throw error;
      
      setRpcResults(data.results || []);
      setRpcSummary(data.summary || null);
      setLastTestedAt(new Date());
      
      if (data.summary?.mainnetReady) {
        toast.success('All RPC endpoints are reachable');
      } else {
        toast.warning('Some RPC endpoints are unreachable');
      }
    } catch (error) {
      console.error('Error testing RPC connectivity:', error);
      toast.error('Failed to test RPC connectivity');
    } finally {
      setTestingRpc(false);
    }
  };

  // Get result for a specific network based on current mode
  const getNetworkResult = (networkKey: string): RpcTestResult | undefined => {
    const mapping = NETWORK_DISPLAY_MAP[networkKey];
    if (!mapping) return undefined;
    
    const targetNetwork = isMainnetMode ? mapping.mainnet : mapping.testnet;
    return rpcResults.find(r => r.network === targetNetwork);
  };

  const handleToggleAttempt = async (checked: boolean) => {
    if (checked) {
      // Test connectivity before allowing mainnet switch
      if (!rpcSummary?.mainnetReady) {
        setTestingRpc(true);
        try {
          const { data, error } = await supabase.functions.invoke('test-rpc-connectivity', {
            body: { testMainnet: true, testTestnet: false }
          });
          
          if (error) throw error;
          
          setRpcResults(prev => {
            const nonMainnet = prev.filter(r => !r.isMainnet);
            return [...nonMainnet, ...(data.results || [])];
          });
          setRpcSummary(data.summary || null);
          setLastTestedAt(new Date());
          
          if (!data.summary?.mainnetReady) {
            toast.error('Cannot enable mainnet: Some RPC endpoints are unreachable. Please fix the connectivity issues first.');
            return;
          }
        } catch (error) {
          console.error('Error testing RPC connectivity:', error);
          toast.error('Failed to verify RPC connectivity');
          return;
        } finally {
          setTestingRpc(false);
        }
      }
      
      // Switching TO mainnet requires confirmation
      setConfirmStep(1);
      setShowMainnetConfirm(true);
    } else {
      // Switching to testnet is safe
      onToggle(false);
    }
  };

  const handleMainnetConfirm = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
    } else {
      setShowMainnetConfirm(false);
      setConfirmStep(1);
      await onToggle(true);
    }
  };

  const handleMainnetCancel = () => {
    setShowMainnetConfirm(false);
    setConfirmStep(1);
  };

  const getLatencyColor = (latencyMs: number | null): string => {
    if (latencyMs === null) return 'text-muted-foreground';
    if (latencyMs < 200) return 'text-green-500';
    if (latencyMs < 500) return 'text-amber-500';
    return 'text-destructive';
  };

  const getStatusIcon = (result: RpcTestResult | undefined) => {
    if (!result) return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    if (result.status === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    if (result.status === 'timeout') return <WifiOff className="h-3.5 w-3.5 text-amber-500" />;
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  };

  return (
    <>
      <Card className={`border-2 ${isMainnetMode ? 'border-destructive bg-destructive/5' : 'border-amber-500 bg-amber-500/5'}`}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isMainnetMode ? (
                <div className="p-2 rounded-full bg-destructive/20">
                  <Globe className="h-6 w-6 text-destructive" />
                </div>
              ) : (
                <div className="p-2 rounded-full bg-amber-500/20">
                  <TestTube className="h-6 w-6 text-amber-500" />
                </div>
              )}
              <div>
                <CardTitle className="flex items-center gap-2">
                  Network Mode
                  <Badge 
                    variant={isMainnetMode ? 'destructive' : 'outline'} 
                    className={!isMainnetMode ? 'border-amber-500 text-amber-600 dark:text-amber-400' : ''}
                  >
                    {isMainnetMode ? 'MAINNET' : 'DEVNET / TESTNET'}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {isMainnetMode 
                    ? 'Real blockchain transactions with real funds' 
                    : 'Simulated transactions for testing purposes'}
                </CardDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRpcConfig(true)}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Configure RPCs
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={testRpcConnectivity}
                disabled={testingRpc}
              >
                {testingRpc ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4 mr-2" />
                )}
                Test RPCs
              </Button>
              
              <div className="flex flex-col items-end gap-1">
                <Label htmlFor="network-mode" className="text-sm font-medium">
                  {isMainnetMode ? 'Live Mode' : 'Test Mode'}
                </Label>
                <span className="text-xs text-muted-foreground">
                  {isMainnetMode ? 'Real trades active' : 'Safe simulation'}
                </span>
              </div>
              <Switch
                id="network-mode"
                checked={isMainnetMode}
                onCheckedChange={handleToggleAttempt}
                disabled={isUpdating || testingRpc}
                className={isMainnetMode ? 'data-[state=checked]:bg-destructive' : ''}
              />
              {(isUpdating || testingRpc) && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* RPC Status Summary */}
          {rpcSummary && (
            <div className="flex items-center gap-4 p-2 rounded-lg bg-background/50 text-sm">
              <div className="flex items-center gap-2">
                {rpcSummary.mainnetReady ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                <span>
                  Mainnet: {rpcSummary.mainnetOk}/{rpcSummary.mainnetTotal} OK
                  {rpcSummary.avgMainnetLatency && (
                    <span className={`ml-1 ${getLatencyColor(rpcSummary.avgMainnetLatency)}`}>
                      (avg {rpcSummary.avgMainnetLatency}ms)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>
                  Testnet: {rpcSummary.testnetOk}/{rpcSummary.testnetTotal} OK
                  {rpcSummary.avgTestnetLatency && (
                    <span className={`ml-1 ${getLatencyColor(rpcSummary.avgTestnetLatency)}`}>
                      (avg {rpcSummary.avgTestnetLatency}ms)
                    </span>
                  )}
                </span>
              </div>
              {lastTestedAt && (
                <span className="text-xs text-muted-foreground ml-auto">
                  Tested: {lastTestedAt.toLocaleTimeString()}
                </span>
              )}
            </div>
          )}
          
          {/* Network Status Grid */}
          <div className="grid gap-3 sm:grid-cols-5">
            {Object.keys(NETWORK_DISPLAY_MAP).map((networkKey) => {
              const result = getNetworkResult(networkKey);
              const mapping = NETWORK_DISPLAY_MAP[networkKey];
              const displayNetwork = isMainnetMode ? mapping.mainnet : mapping.testnet;
              
              return (
                <div 
                  key={networkKey}
                  className={`p-3 rounded-lg border transition-colors ${
                    result?.status === 'ok'
                      ? 'border-green-500/30 bg-green-500/5'
                      : result?.status === 'error' || result?.status === 'timeout'
                        ? 'border-destructive/30 bg-destructive/5'
                        : isMainnetMode 
                          ? 'border-destructive/30 bg-destructive/5' 
                          : 'border-amber-500/30 bg-amber-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{networkKey}</span>
                    {getStatusIcon(result)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {displayNetwork.replace('_', ' ')}
                  </div>
                  {result && (
                    <div className="mt-2 space-y-1">
                      {result.latencyMs !== null && (
                        <div className={`text-xs font-mono ${getLatencyColor(result.latencyMs)}`}>
                          {result.latencyMs}ms
                        </div>
                      )}
                      {result.error && (
                        <div className="text-[10px] text-destructive truncate" title={result.error}>
                          {result.error}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground/70">
                        {result.urlSource === 'secret' ? 'From Secret' : 
                         result.urlSource === 'database' ? 'Custom RPC' : 'Public RPC'}
                      </div>
                      Click "Test RPCs"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Mode badges */}
          {isMainnetMode && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="destructive">Live Trades</Badge>
              <Badge variant="destructive">Real Gas Costs</Badge>
              <Badge variant="destructive">Real PnL</Badge>
            </div>
          )}
          
          {!isMainnetMode && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                Simulated Only
              </Badge>
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                No Real Transactions
              </Badge>
            </div>
          )}
          
          {/* Mainnet readiness warning */}
          {rpcSummary && !rpcSummary.mainnetReady && !isMainnetMode && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Cannot enable mainnet mode: Some RPC endpoints are unreachable. 
                Please check your RPC configuration.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mainnet Confirmation Dialog */}
      <AlertDialog open={showMainnetConfirm} onOpenChange={setShowMainnetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {confirmStep === 1 ? 'Enable Mainnet Mode?' : 'Final Confirmation'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {confirmStep === 1 ? (
                  <>
                    <p>
                      <strong>Warning:</strong> Enabling mainnet mode will execute real blockchain 
                      transactions with real funds across all networks.
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>Solana → Mainnet</li>
                      <li>Polygon → Mainnet</li>
                      <li>Ethereum → Mainnet</li>
                      <li>Arbitrum → Mainnet</li>
                      <li>BSC → Mainnet</li>
                    </ul>
                    {rpcSummary && (
                      <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm">
                          All {rpcSummary.mainnetTotal} mainnet RPC endpoints verified
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-medium text-destructive">
                      This is your final confirmation. Once enabled:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>Real blockchain transactions will be executed</li>
                      <li>Real funds from OPS wallets will be used</li>
                      <li>Real gas costs will be incurred</li>
                      <li>Profits and losses will be real</li>
                    </ul>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleMainnetCancel}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleMainnetConfirm}>
              {confirmStep === 1 ? 'Continue' : 'Enable Mainnet Mode'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* RPC Configuration Modal */}
      <RpcConfigModal
        open={showRpcConfig}
        onOpenChange={setShowRpcConfig}
        onSaved={testRpcConnectivity}
      />
    </>
  );
}
