import { Link } from 'react-router-dom';
import { ExternalLink, Wallet, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Asset, TokenDefinition, UserTokenHolding, ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from '@/types/database';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TokenBalance {
  mint: string;
  balance: number;
  rawBalance: string;
  decimals: number;
}

interface HoldingWithDetails extends UserTokenHolding {
  token_definition: TokenDefinition & { asset: Asset };
}

interface HoldingsTableProps {
  holdings: HoldingWithDetails[];
  isLoading: boolean;
  onChainBalances?: Record<string, TokenBalance>;
  isLoadingBalances?: boolean;
}

export function HoldingsTable({ holdings, isLoading, onChainBalances, isLoadingBalances }: HoldingsTableProps) {
  const getOnChainStatus = (holding: HoldingWithDetails) => {
    const mint = holding.token_definition.contract_address;
    if (!mint || !onChainBalances) return null;
    
    const onChainBalance = onChainBalances[mint];
    if (!onChainBalance) return null;
    
    const offChainBalance = Number(holding.balance);
    const chainBalance = onChainBalance.balance;
    
    if (chainBalance >= offChainBalance) {
      return { status: 'synced', balance: chainBalance };
    } else if (chainBalance > 0) {
      return { status: 'partial', balance: chainBalance, pending: offChainBalance - chainBalance };
    } else {
      return { status: 'pending', balance: 0, pending: offChainBalance };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No token holdings yet.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Contact an administrator to receive tokens.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="table-header">
            <th className="text-left py-3 px-4">Token</th>
            <th className="text-left py-3 px-4">Balance</th>
            <th className="text-left py-3 px-4">On-chain</th>
            <th className="text-left py-3 px-4">Delivery Wallet</th>
            <th className="text-left py-3 px-4">Backing Asset</th>
            <th className="text-right py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {holdings.filter(h => h.token_definition).map((holding) => (
            <tr key={holding.id} className="hover:bg-muted/30 transition-colors">
              <td className="table-cell">
                <div>
                  <p className="font-medium text-foreground">
                    {holding.token_definition.token_name}
                  </p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {holding.token_definition.token_symbol}
                  </p>
                </div>
              </td>
              <td className="table-cell">
                <span className="font-mono text-lg font-semibold text-primary">
                  {Number(holding.balance).toLocaleString()}
                </span>
              </td>
              <td className="table-cell">
                {(() => {
                  const chain = holding.token_definition.chain;
                  const isBlockchainToken = chain && chain !== 'NONE' && holding.token_definition.deployment_status === 'DEPLOYED';
                  
                  if (!isBlockchainToken) {
                    return <span className="text-muted-foreground text-sm">Off-chain only</span>;
                  }
                  
                  if (isLoadingBalances) {
                    return (
                      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    );
                  }
                  
                  const status = getOnChainStatus(holding);
                  if (!status) {
                    return <span className="text-muted-foreground text-sm">--</span>;
                  }
                  
                  if (status.status === 'synced') {
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-emerald-500" />
                              <span className="font-mono text-sm text-emerald-500">
                                {status.balance.toLocaleString()}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Fully synced on-chain (Devnet)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  } else {
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-amber-500" />
                              <span className="font-mono text-sm text-foreground">
                                {status.balance.toLocaleString()}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              {status.pending?.toLocaleString()} tokens pending delivery
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }
                })()}
              </td>
              <td className="table-cell">
                {(() => {
                  const chain = holding.token_definition.chain;
                  const isBlockchainToken = chain && chain !== 'NONE';
                  const needsEvmWallet = chain === 'ETHEREUM' || chain === 'POLYGON' || chain === 'BSC';
                  const needsSolanaWallet = chain === 'SOLANA';
                  
                  if (holding.delivery_wallet_address) {
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2">
                              <Wallet className="h-4 w-4 text-emerald-500" />
                              <span className="font-mono text-xs text-foreground">
                                {holding.delivery_wallet_address.slice(0, 6)}...{holding.delivery_wallet_address.slice(-4)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{holding.delivery_wallet_address}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  } else if (isBlockchainToken) {
                    const walletType = needsEvmWallet ? 'EVM' : needsSolanaWallet ? 'Solana' : '';
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 text-amber-500">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-xs font-medium">Required</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              Connect a {walletType} wallet in your Profile
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  } else {
                    return <span className="text-muted-foreground text-sm">--</span>;
                  }
                })()}
              </td>
              <td className="table-cell">
                <p className="text-foreground">
                  {holding.token_definition.asset?.name}
                </p>
              </td>
              <td className="table-cell text-right">
                <Link 
                  to={`/assets/${holding.token_definition.asset_id}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  View Asset
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
