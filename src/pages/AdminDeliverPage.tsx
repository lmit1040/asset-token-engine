import { useEffect, useState, useCallback } from 'react';
import { Search, Send, ExternalLink, AlertTriangle, CheckCircle2, Wallet, RefreshCw, Coins, Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Profile, TokenDefinition, Asset, UserTokenHolding } from '@/types/database';
import { toast } from 'sonner';

interface TokenWithAsset extends TokenDefinition {
  asset: Asset;
}

interface HoldingWithDetails extends UserTokenHolding {
  token_definition: TokenWithAsset;
  user: Profile;
}

interface TreasuryBalance {
  balance: number;
  isLoading: boolean;
  error?: string;
}

interface TokenForMint {
  id: string;
  symbol: string;
  name: string;
  totalSupply: number;
  decimals: number;
}

export default function AdminDeliverPage() {
  const [holdings, setHoldings] = useState<HoldingWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDelivering, setIsDelivering] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChain, setFilterChain] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('ready');
  const [treasuryBalances, setTreasuryBalances] = useState<Record<string, TreasuryBalance>>({});
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
  const [mintModalOpen, setMintModalOpen] = useState(false);
  const [mintingToken, setMintingToken] = useState<TokenForMint | null>(null);
  const [isMinting, setIsMinting] = useState(false);

  useEffect(() => {
    fetchHoldings();
  }, []);

  async function fetchHoldings() {
    setIsLoading(true);
    try {
      // Fetch holdings with token data
      const { data: holdingsData, error: holdingsError } = await supabase
        .from('user_token_holdings')
        .select(`
          *,
          token_definition:token_definitions(*, asset:assets(*))
        `)
        .gt('balance', 0)
        .order('assigned_at', { ascending: false });

      if (holdingsError) throw holdingsError;

      // Fetch all profiles separately
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*');

      if (profilesError) throw profilesError;

      // Create a map for quick profile lookup
      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      // Merge holdings with user profiles
      const mergedHoldings = holdingsData?.map(holding => ({
        ...holding,
        user: profilesMap.get(holding.user_id) || { id: holding.user_id, email: 'Unknown', name: null }
      })) || [];

      setHoldings(mergedHoldings as unknown as HoldingWithDetails[]);
    } catch (error) {
      console.error('Error fetching holdings:', error);
      toast.error('Failed to load holdings');
    } finally {
      setIsLoading(false);
    }
  }

  // Fetch treasury balances for all unique deployed tokens
  const fetchTreasuryBalances = useCallback(async (holdingsData: HoldingWithDetails[]) => {
    // Get unique deployed Solana tokens with treasury accounts
    const uniqueTokens = new Map<string, { treasuryAccount: string; contractAddress: string; symbol: string }>();
    
    holdingsData.forEach(h => {
      const token = h.token_definition;
      if (token.chain === 'SOLANA' && token.deployment_status === 'DEPLOYED' && token.treasury_account && token.contract_address) {
        if (!uniqueTokens.has(token.id)) {
          uniqueTokens.set(token.id, {
            treasuryAccount: token.treasury_account,
            contractAddress: token.contract_address,
            symbol: token.token_symbol,
          });
        }
      }
    });

    if (uniqueTokens.size === 0) return;

    // Mark all as loading
    const loadingState: Record<string, TreasuryBalance> = {};
    uniqueTokens.forEach((_, tokenId) => {
      loadingState[tokenId] = { balance: 0, isLoading: true };
    });
    setTreasuryBalances(loadingState);

    // Fetch balances for each token
    for (const [tokenId, tokenInfo] of uniqueTokens) {
      try {
        const { data, error } = await supabase.functions.invoke('get-solana-balances', {
          body: {
            walletAddress: tokenInfo.treasuryAccount,
            mintAddresses: [tokenInfo.contractAddress],
            isTreasuryAccount: true,
          },
        });

        if (error || !data?.success) {
          setTreasuryBalances(prev => ({
            ...prev,
            [tokenId]: { balance: 0, isLoading: false, error: 'Failed to fetch' },
          }));
        } else {
          const balance = data.balances?.[0]?.balance || 0;
          setTreasuryBalances(prev => ({
            ...prev,
            [tokenId]: { balance, isLoading: false },
          }));
        }
      } catch (err) {
        console.error(`Failed to fetch treasury balance for ${tokenInfo.symbol}:`, err);
        setTreasuryBalances(prev => ({
          ...prev,
          [tokenId]: { balance: 0, isLoading: false, error: 'Error' },
        }));
      }
    }
  }, []);

  const handleRefreshBalances = async () => {
    setIsRefreshingBalances(true);
    await fetchTreasuryBalances(holdings);
    setIsRefreshingBalances(false);
    toast.success('Treasury balances refreshed');
  };

  // Fetch balances when holdings change and auto-refresh every 30 seconds
  useEffect(() => {
    if (holdings.length > 0) {
      fetchTreasuryBalances(holdings);
      
      // Auto-refresh every 30 seconds
      const interval = setInterval(() => {
        fetchTreasuryBalances(holdings);
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [holdings, fetchTreasuryBalances]);

  const openMintModal = (token: TokenForMint) => {
    setMintingToken(token);
    setMintModalOpen(true);
  };

  const handleMintToTreasury = async () => {
    if (!mintingToken) return;
    
    setIsMinting(true);
    try {
      const { data, error } = await supabase.functions.invoke('mint-to-treasury', {
        body: { tokenDefinitionId: mintingToken.id },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success(
        <div className="space-y-1">
          <p>Minted tokens to {mintingToken.symbol} treasury!</p>
          {data.transactionSignature && (
            <a
              href={`https://explorer.solana.com/tx/${data.transactionSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm flex items-center gap-1"
            >
              View transaction <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      );

      setMintModalOpen(false);
      setMintingToken(null);
      // Refresh balances after minting
      handleRefreshBalances();
    } catch (error: any) {
      console.error('Minting failed:', error);
      toast.error(error.message || 'Failed to mint tokens to treasury');
    } finally {
      setIsMinting(false);
    }
  };

  const handleDeliver = async (holding: HoldingWithDetails, amount: number) => {
    if (!holding.user.solana_wallet_address) {
      toast.error('User does not have a Solana wallet connected');
      return;
    }

    setIsDelivering(holding.id);
    try {
      const { data, error } = await supabase.functions.invoke('transfer-solana-token', {
        body: {
          holdingId: holding.id,
          amount,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(
        <div className="space-y-1">
          <p>Delivered {amount} {holding.token_definition.token_symbol} on-chain!</p>
          <a
            href={data.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-sm flex items-center gap-1"
          >
            View transaction <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      );

      // Refresh holdings
      fetchHoldings();
    } catch (error: any) {
      console.error('Delivery failed:', error);
      toast.error(error.message || 'Failed to deliver tokens on-chain');
    } finally {
      setIsDelivering(null);
    }
  };

  // Filter holdings
  const filteredHoldings = holdings.filter((holding) => {
    const token = holding.token_definition;
    const user = holding.user;

    // Search filter
    const matchesSearch =
      searchQuery === '' ||
      token.token_symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.token_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchQuery.toLowerCase());

    // Chain filter
    const matchesChain = filterChain === 'all' || token.chain === filterChain;

    // When searching, show all matches regardless of status filter
    if (searchQuery !== '') {
      return matchesSearch && matchesChain;
    }

    // Status filter (only applied when not searching)
    const isDeployed = token.deployment_status === 'DEPLOYED';
    const hasWallet =
      (token.chain === 'SOLANA' && user.solana_wallet_address) ||
      (['ETHEREUM', 'POLYGON', 'BSC'].includes(token.chain) && user.evm_wallet_address);
    const isReady = isDeployed && hasWallet && token.chain === 'SOLANA';

    if (filterStatus === 'ready') return matchesChain && isReady;
    if (filterStatus === 'pending') return matchesChain && (!isDeployed || !hasWallet);
    return matchesChain;

  });

  const getHoldingStatus = (holding: HoldingWithDetails) => {
    const token = holding.token_definition;
    const user = holding.user;

    if (token.chain !== 'SOLANA') {
      return { status: 'unsupported', label: 'Not Solana', color: 'secondary' as const };
    }
    if (token.deployment_status !== 'DEPLOYED') {
      return { status: 'not_deployed', label: 'Not Deployed', color: 'secondary' as const };
    }
    if (!user.solana_wallet_address) {
      return { status: 'no_wallet', label: 'No Wallet', color: 'destructive' as const };
    }
    return { status: 'ready', label: 'Ready', color: 'default' as const };
  };

  return (
    <DashboardLayout
      title="On-Chain Delivery"
      subtitle="Deliver tokens to user wallets on Solana Devnet"
      requireAdmin
    >
      <div className="space-y-6 animate-fade-in">
        {/* Treasury Summary */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Treasury Status
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshBalances}
              disabled={isRefreshingBalances}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshingBalances ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(() => {
              // Get unique deployed Solana tokens
              const uniqueTokens = new Map<string, { symbol: string; name: string; balance: number | undefined; isLoading: boolean; error?: string; totalUserBalance: number; totalSupply: number; decimals: number }>();
              holdings.forEach(h => {
                const token = h.token_definition;
                if (token.chain === 'SOLANA' && token.deployment_status === 'DEPLOYED' && token.treasury_account) {
                  const existing = uniqueTokens.get(token.id);
                  const treasuryData = treasuryBalances[token.id];
                  uniqueTokens.set(token.id, {
                    symbol: token.token_symbol,
                    name: token.token_name,
                    balance: treasuryData?.balance,
                    isLoading: treasuryData?.isLoading ?? true,
                    error: treasuryData?.error,
                    totalUserBalance: (existing?.totalUserBalance || 0) + Number(h.balance),
                    totalSupply: token.total_supply,
                    decimals: token.decimals,
                  });
                }
              });

              if (uniqueTokens.size === 0) {
                return <span className="text-sm text-muted-foreground">No deployed Solana tokens</span>;
              }

              return Array.from(uniqueTokens.entries()).map(([tokenId, data]) => {
                const balance = data.balance ?? 0;
                const isEmpty = balance === 0;
                const isLow = !isEmpty && balance < data.totalUserBalance;
                const needsMint = isEmpty || isLow;
                
                return (
                  <div
                    key={tokenId}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                      data.isLoading ? 'border-border bg-muted/30' :
                      data.error ? 'border-destructive/50 bg-destructive/10' :
                      isEmpty ? 'border-destructive bg-destructive/10' :
                      isLow ? 'border-amber-500/50 bg-amber-500/10' :
                      'border-emerald-500/50 bg-emerald-500/10'
                    }`}
                  >
                    <span className="font-mono font-medium text-sm">{data.symbol}</span>
                    {data.isLoading ? (
                      <span className="text-xs text-muted-foreground">...</span>
                    ) : data.error ? (
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                    ) : isEmpty ? (
                      <Badge variant="destructive" className="text-xs">Empty</Badge>
                    ) : isLow ? (
                      <span className="text-xs text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {balance.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {balance.toLocaleString()}
                      </span>
                    )}
                    {needsMint && !data.isLoading && !data.error && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => openMintModal({
                          id: tokenId,
                          symbol: data.symbol,
                          name: data.name,
                          totalSupply: data.totalSupply,
                          decimals: data.decimals,
                        })}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Mint
                      </Button>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by user or token..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 input-dark"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <Select value={filterChain} onValueChange={setFilterChain}>
                <SelectTrigger className="w-36 input-dark">
                  <SelectValue placeholder="Chain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Chains</SelectItem>
                  <SelectItem value="SOLANA">Solana</SelectItem>
                  <SelectItem value="ETHEREUM">Ethereum</SelectItem>
                  <SelectItem value="POLYGON">Polygon</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 input-dark">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ready">Ready to Deliver</SelectItem>
                  <SelectItem value="pending">Pending Setup</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Holdings List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredHoldings.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Send className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No holdings found matching your criteria.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredHoldings.map((holding) => {
              const status = getHoldingStatus(holding);
              const isCurrentlyDelivering = isDelivering === holding.id;

              return (
                <div key={holding.id} className="glass-card p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground truncate">
                          {holding.user.name || 'No name'}
                        </span>
                        <Badge variant={status.color} className="shrink-0">
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{holding.user.email}</p>
                      {holding.user.solana_wallet_address && (
                        <p className="text-xs font-mono text-muted-foreground truncate mt-1">
                          <Wallet className="inline h-3 w-3 mr-1" />
                          {holding.user.solana_wallet_address.slice(0, 8)}...{holding.user.solana_wallet_address.slice(-6)}
                        </p>
                      )}
                    </div>

                    {/* Token Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-primary font-medium">
                          {holding.token_definition.token_symbol}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {holding.token_definition.token_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">User Balance:</span>
                          <span className="font-mono text-foreground">
                            {Number(holding.balance).toLocaleString()}
                          </span>
                        </div>
                        {holding.token_definition.deployment_status === 'DEPLOYED' && holding.token_definition.chain === 'SOLANA' && (
                          <div className="flex items-center gap-1">
                            <Coins className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">Treasury:</span>
                            {treasuryBalances[holding.token_definition.id]?.isLoading ? (
                              <span className="text-xs text-muted-foreground">loading...</span>
                            ) : treasuryBalances[holding.token_definition.id]?.error ? (
                              <span className="text-xs text-destructive">error</span>
                            ) : (treasuryBalances[holding.token_definition.id]?.balance || 0) === 0 ? (
                              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Empty - Mint Required
                              </Badge>
                            ) : (treasuryBalances[holding.token_definition.id]?.balance || 0) < Number(holding.balance) ? (
                              <Badge variant="outline" className="text-xs text-amber-500 border-amber-500 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {(treasuryBalances[holding.token_definition.id]?.balance || 0).toLocaleString()} (Low)
                              </Badge>
                            ) : (
                              <span className="font-mono text-emerald-500 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {(treasuryBalances[holding.token_definition.id]?.balance || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {holding.token_definition.chain}
                        </Badge>
                        {holding.token_definition.deployment_status === 'DEPLOYED' && (
                          <a
                            href={`https://explorer.solana.com/address/${holding.token_definition.contract_address}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            View Token <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="shrink-0">
                      {status.status === 'ready' ? (
                        <DeliverButton
                          holding={holding}
                          isDelivering={isCurrentlyDelivering}
                          onDeliver={handleDeliver}
                        />
                      ) : status.status === 'no_wallet' ? (
                        <div className="flex items-center gap-2 text-sm text-amber-500">
                          <AlertTriangle className="h-4 w-4" />
                          User needs wallet
                        </div>
                      ) : status.status === 'not_deployed' ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <AlertTriangle className="h-4 w-4" />
                          Deploy token first
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Only Solana supported
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mint to Treasury Modal */}
      <Dialog open={mintModalOpen} onOpenChange={setMintModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mint to Treasury</DialogTitle>
            <DialogDescription>
              This will mint the full token supply to the treasury account for {mintingToken?.symbol}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Token</Label>
                <p className="font-mono font-medium">{mintingToken?.symbol}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Name</Label>
                <p className="text-foreground">{mintingToken?.name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Total Supply</Label>
                <p className="font-mono">{mintingToken?.totalSupply?.toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Decimals</Label>
                <p className="font-mono">{mintingToken?.decimals}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The mint function will top up the treasury to the full total supply. Any existing tokens in the treasury will remain.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMintModalOpen(false)} disabled={isMinting}>
              Cancel
            </Button>
            <Button onClick={handleMintToTreasury} disabled={isMinting}>
              {isMinting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Minting...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Mint to Treasury
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// Separate component for deliver button with amount input
function DeliverButton({
  holding,
  isDelivering,
  onDeliver,
}: {
  holding: HoldingWithDetails;
  isDelivering: boolean;
  onDeliver: (holding: HoldingWithDetails, amount: number) => void;
}) {
  const [amount, setAmount] = useState(holding.balance.toString());
  const maxAmount = Number(holding.balance);

  const handleSubmit = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (numAmount > maxAmount) {
      toast.error(`Amount exceeds balance (${maxAmount})`);
      return;
    }
    onDeliver(holding, numAmount);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Input
          type="number"
          step="any"
          min="0"
          max={maxAmount}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 input-dark text-sm"
          disabled={isDelivering}
        />
        <button
          type="button"
          onClick={() => setAmount(maxAmount.toString())}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary hover:underline"
        >
          Max
        </button>
      </div>
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={isDelivering}
        className="shrink-0"
      >
        {isDelivering ? (
          <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <Send className="h-4 w-4 mr-1" />
            Deliver
          </>
        )}
      </Button>
    </div>
  );
}
