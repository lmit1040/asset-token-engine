import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog, 
  AlertDialogAction, 
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
  Loader2
} from 'lucide-react';

interface NetworkModeCardProps {
  isMainnetMode: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
  isUpdating?: boolean;
}

interface NetworkStatus {
  name: string;
  mainnet: string;
  testnet: string;
  hasCustomRpc: boolean;
}

const NETWORK_STATUS: NetworkStatus[] = [
  { name: 'Solana', mainnet: 'Mainnet', testnet: 'Devnet', hasCustomRpc: true },
  { name: 'Polygon', mainnet: 'Polygon', testnet: 'Amoy', hasCustomRpc: true },
  { name: 'Ethereum', mainnet: 'Mainnet', testnet: 'Sepolia', hasCustomRpc: true },
  { name: 'Arbitrum', mainnet: 'Arbitrum', testnet: 'Sepolia', hasCustomRpc: true },
  { name: 'BSC', mainnet: 'Mainnet', testnet: 'Testnet', hasCustomRpc: true },
];

export function NetworkModeCard({ isMainnetMode, onToggle, isUpdating }: NetworkModeCardProps) {
  const [showMainnetConfirm, setShowMainnetConfirm] = useState(false);
  const [confirmStep, setConfirmStep] = useState(1);

  const handleToggleAttempt = (checked: boolean) => {
    if (checked) {
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
            
            <div className="flex items-center gap-4">
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
                disabled={isUpdating}
                className={isMainnetMode ? 'data-[state=checked]:bg-destructive' : ''}
              />
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-5">
            {NETWORK_STATUS.map((network) => (
              <div 
                key={network.name}
                className={`p-3 rounded-lg border ${
                  isMainnetMode 
                    ? 'border-destructive/30 bg-destructive/5' 
                    : 'border-amber-500/30 bg-amber-500/5'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{network.name}</span>
                  {network.hasCustomRpc ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isMainnetMode ? network.mainnet : network.testnet}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">
                  {network.hasCustomRpc ? 'Alchemy RPC' : 'Public RPC'}
                </div>
              </div>
            ))}
          </div>
          
          {isMainnetMode && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="destructive">Live Trades</Badge>
              <Badge variant="destructive">Real Gas Costs</Badge>
              <Badge variant="destructive">Real PnL</Badge>
            </div>
          )}
          
          {!isMainnetMode && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                Simulated Only
              </Badge>
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                No Real Transactions
              </Badge>
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
                    <p className="text-sm text-muted-foreground">
                      Ensure all RPC endpoints are properly configured before proceeding.
                    </p>
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
    </>
  );
}
