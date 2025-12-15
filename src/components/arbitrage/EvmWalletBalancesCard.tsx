import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  Wallet, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface OpsWalletInfo {
  configured: boolean;
  network: string;
  chain_id: number;
  address: string;
  balance: string;
  balance_display: string;
  error?: string;
}

interface EvmFeePayer {
  id: string;
  public_key: string;
  label: string;
  network: string;
  is_active: boolean;
  balance_native: number | null;
}

const NETWORK_EXPLORERS: Record<string, string> = {
  POLYGON: 'https://polygonscan.com/address/',
  ETHEREUM: 'https://etherscan.io/address/',
  ARBITRUM: 'https://arbiscan.io/address/',
  BSC: 'https://bscscan.com/address/',
};

const NETWORK_SYMBOLS: Record<string, string> = {
  POLYGON: 'MATIC',
  ETHEREUM: 'ETH',
  ARBITRUM: 'ETH',
  BSC: 'BNB',
};

const MIN_BALANCE_THRESHOLD = 0.01; // Minimum balance for healthy status

export function EvmWalletBalancesCard() {
  const [opsWallets, setOpsWallets] = useState<Record<string, OpsWalletInfo>>({});
  const [feePayers, setFeePayers] = useState<EvmFeePayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshingBalances, setRefreshingBalances] = useState(false);

  useEffect(() => {
    fetchFeePayers();
  }, []);

  const fetchFeePayers = async () => {
    const { data } = await supabase
      .from('evm_fee_payer_keys')
      .select('id, public_key, label, network, is_active, balance_native')
      .order('network, label');
    
    if (data) {
      setFeePayers(data);
    }
  };

  const checkAllWalletBalances = async () => {
    setLoading(true);
    const networks = ['POLYGON', 'ETHEREUM', 'ARBITRUM', 'BSC'];
    const results: Record<string, OpsWalletInfo> = {};

    try {
      // Fetch OPS wallet info for each network
      for (const network of networks) {
        try {
          const { data, error } = await supabase.functions.invoke('get-evm-ops-wallet-info', {
            body: { network }
          });
          
          if (error) {
            results[network] = { 
              configured: false, 
              error: error.message,
              network,
              chain_id: 0,
              address: '',
              balance: '0',
              balance_display: 'Error'
            };
          } else {
            results[network] = data;
          }
        } catch (err) {
          results[network] = { 
            configured: false, 
            error: err instanceof Error ? err.message : 'Unknown error',
            network,
            chain_id: 0,
            address: '',
            balance: '0',
            balance_display: 'Error'
          };
        }
      }

      setOpsWallets(results);

      // Also refresh fee payer balances
      setRefreshingBalances(true);
      await supabase.functions.invoke('refresh-evm-fee-payer-balances');
      await fetchFeePayers();
      setRefreshingBalances(false);

      toast.success('All wallet balances refreshed');
    } catch (error) {
      console.error('Error checking wallet balances:', error);
      toast.error('Failed to check wallet balances');
    } finally {
      setLoading(false);
    }
  };

  const getBalanceStatus = (balance: number | null | string) => {
    const numBalance = typeof balance === 'string' ? parseFloat(balance) : (balance ?? 0);
    if (numBalance === 0) return 'empty';
    if (numBalance < MIN_BALANCE_THRESHOLD) return 'low';
    return 'healthy';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'empty':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Empty</Badge>;
      case 'low':
        return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600"><AlertTriangle className="h-3 w-3" />Low</Badge>;
      case 'healthy':
        return <Badge variant="outline" className="gap-1 border-green-500 text-green-600"><CheckCircle2 className="h-3 w-3" />Healthy</Badge>;
      default:
        return null;
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const feePayersByNetwork = feePayers.reduce((acc, fp) => {
    if (!acc[fp.network]) acc[fp.network] = [];
    acc[fp.network].push(fp);
    return acc;
  }, {} as Record<string, EvmFeePayer[]>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              EVM Wallet Balances
            </CardTitle>
            <CardDescription>
              OPS wallet and fee payer balances across EVM networks
            </CardDescription>
          </div>
          <Button onClick={checkAllWalletBalances} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Check All Balances
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* OPS Wallets Section */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            OPS Wallets (Operations)
          </h4>
          
          {Object.keys(opsWallets).length === 0 ? (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              Click "Check All Balances" to fetch current wallet balances
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(opsWallets).map(([network, info]) => (
                <div 
                  key={network}
                  className={`rounded-lg border p-3 ${
                    info.configured 
                      ? getBalanceStatus(info.balance) === 'empty' 
                        ? 'border-destructive/50 bg-destructive/5'
                        : getBalanceStatus(info.balance) === 'low'
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-green-500/30 bg-green-500/5'
                      : 'border-muted bg-muted/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">{network}</Badge>
                    {info.configured && getStatusBadge(getBalanceStatus(info.balance))}
                  </div>
                  
                  {info.configured ? (
                    <>
                      <div className="text-lg font-bold">
                        {parseFloat(info.balance).toFixed(4)} {NETWORK_SYMBOLS[network] || 'ETH'}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <span>{truncateAddress(info.address)}</span>
                        <a
                          href={`${NETWORK_EXPLORERS[network]}${info.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {info.error || 'Not configured'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fee Payers Section */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            Fee Payer Wallets
            {refreshingBalances && <Loader2 className="h-3 w-3 animate-spin" />}
          </h4>
          
          {feePayers.length === 0 ? (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              No EVM fee payers configured
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(feePayersByNetwork).map(([network, payers]) => (
                <div key={network}>
                  <div className="text-xs font-medium text-muted-foreground mb-2">{network}</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {payers.map((fp) => {
                      const status = getBalanceStatus(fp.balance_native);
                      return (
                        <div 
                          key={fp.id}
                          className={`rounded-lg border p-2 text-sm ${
                            !fp.is_active 
                              ? 'border-muted bg-muted/20 opacity-60'
                              : status === 'empty'
                              ? 'border-destructive/50 bg-destructive/5'
                              : status === 'low'
                              ? 'border-amber-500/50 bg-amber-500/5'
                              : 'border-border'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate max-w-[120px]">{fp.label}</span>
                            {fp.is_active ? getStatusBadge(status) : (
                              <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-muted-foreground">{truncateAddress(fp.public_key)}</span>
                            <span className={`font-mono ${
                              status === 'empty' ? 'text-destructive' :
                              status === 'low' ? 'text-amber-600' : ''
                            }`}>
                              {(fp.balance_native ?? 0).toFixed(4)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        {feePayers.length > 0 && (
          <div className="flex gap-4 pt-2 border-t text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">
                Healthy: {feePayers.filter(fp => fp.is_active && getBalanceStatus(fp.balance_native) === 'healthy').length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">
                Low: {feePayers.filter(fp => fp.is_active && getBalanceStatus(fp.balance_native) === 'low').length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive" />
              <span className="text-muted-foreground">
                Empty: {feePayers.filter(fp => fp.is_active && getBalanceStatus(fp.balance_native) === 'empty').length}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
