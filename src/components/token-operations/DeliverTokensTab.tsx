import { useEffect, useState, useCallback } from 'react';
import { Search, Send, ExternalLink, AlertTriangle, CheckCircle2, Wallet, RefreshCw, Coins, Plus, Pause, Play, Info } from 'lucide-react';
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

export default function DeliverTokensTab() {
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
  const [autoRefreshPaused, setAutoRefreshPaused] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [deliveryAmounts, setDeliveryAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchHoldings();
  }, []);

  async function fetchHoldings() {
    setIsLoading(true);
    try {
      const { data: holdingsData, error: holdingsError } = await supabase
        .from('user_token_holdings')
        .select(`*, token_definition:token_definitions(*, asset:assets(*))`)
        .gt('balance', 0)
        .order('assigned_at', { ascending: false });

      if (holdingsError) throw holdingsError;

      const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('*');

      if (profilesError) throw profilesError;

      const profilesMap = new Map(profilesData?.map((p) => [p.id, p]) || []);

      const mergedHoldings =
        holdingsData?.map((holding) => ({
          ...holding,
          user: profilesMap.get(holding.user_id) || { id: holding.user_id, email: 'Unknown', name: null },
        })) || [];

      setHoldings(mergedHoldings as unknown as HoldingWithDetails[]);
    } catch (error) {
      console.error('Error fetching holdings:', error);
      toast.error('Failed to load holdings');
    } finally {
      setIsLoading(false);
    }
  }

  const fetchTreasuryBalances = useCallback(async (holdingsData: HoldingWithDetails[]) => {
    const uniqueTokens = new Map<string, { treasuryAccount: string; contractAddress: string; symbol: string }>();

    holdingsData.forEach((h) => {
      const token = h.token_definition;
      if (
        token.chain === 'SOLANA' &&
        token.deployment_status === 'DEPLOYED' &&
        token.treasury_account &&
        token.contract_address
      ) {
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

    const loadingState: Record<string, TreasuryBalance> = {};
    uniqueTokens.forEach((_, tokenId) => {
      loadingState[tokenId] = { balance: 0, isLoading: true };
    });
    setTreasuryBalances(loadingState);

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
          setTreasuryBalances((prev) => ({
            ...prev,
            [tokenId]: { balance: 0, isLoading: false, error: 'Failed to fetch' },
          }));
        } else {
          const balance = data.balances?.[0]?.balance || 0;
          setTreasuryBalances((prev) => ({
            ...prev,
            [tokenId]: { balance, isLoading: false },
          }));
        }
      } catch (err) {
        console.error(`Failed to fetch treasury balance for ${tokenInfo.symbol}:`, err);
        setTreasuryBalances((prev) => ({
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

  useEffect(() => {
    if (holdings.length > 0) {
      fetchTreasuryBalances(holdings);
      setCountdown(30);
    }
  }, [holdings, fetchTreasuryBalances]);

  useEffect(() => {
    if (holdings.length === 0) return;

    const interval = setInterval(() => {
      if (autoRefreshPaused) return;

      setCountdown((prev) => {
        if (prev <= 1) {
          fetchTreasuryBalances(holdings);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [holdings, autoRefreshPaused, fetchTreasuryBalances]);

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
          <p>
            Delivered {amount} {holding.token_definition.token_symbol} on-chain!
          </p>
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

      fetchHoldings();
    } catch (error: any) {
      console.error('Delivery failed:', error);
      toast.error(error.message || 'Failed to deliver tokens on-chain');
    } finally {
      setIsDelivering(null);
    }
  };

  const filteredHoldings = holdings.filter((holding) => {
    const token = holding.token_definition;
    const user = holding.user;

    const matchesSearch =
      searchQuery === '' ||
      token.token_symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.token_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesChain = filterChain === 'all' || token.chain === filterChain;

    if (searchQuery !== '') {
      return matchesSearch && matchesChain;
    }

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
    <div className="space-y-4">
      <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border text-sm text-muted-foreground flex items-start gap-2">
        <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <span>
          On-chain delivery transfers actual tokens from the treasury to user wallets on Solana. This is a{' '}
          <strong>blockchain transaction</strong>.
        </span>
      </div>

      {/* Treasury Summary */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Treasury Status
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Auto-refresh in</span>
              <span
                className={`font-mono min-w-[2ch] ${autoRefreshPaused ? 'text-muted-foreground/50' : 'text-foreground'}`}
              >
                {autoRefreshPaused ? '--' : countdown}s
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setAutoRefreshPaused(!autoRefreshPaused)}
              title={autoRefreshPaused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
            >
              {autoRefreshPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefreshBalances} disabled={isRefreshingBalances}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshingBalances ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(() => {
            const uniqueTokens = new Map<
              string,
              {
                symbol: string;
                name: string;
                balance: number | undefined;
                isLoading: boolean;
                error?: string;
                totalUserBalance: number;
                totalSupply: number;
                decimals: number;
              }
            >();
            holdings.forEach((h) => {
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
                    data.isLoading
                      ? 'border-border bg-muted/30'
                      : data.error
                        ? 'border-destructive/50 bg-destructive/10'
                        : isEmpty
                          ? 'border-destructive bg-destructive/10'
                          : isLow
                            ? 'border-amber-500/50 bg-amber-500/10'
                            : 'border-emerald-500/50 bg-emerald-500/10'
                  }`}
                >
                  <span className="font-mono font-medium text-sm">{data.symbol}</span>
                  {data.isLoading ? (
                    <span className="text-xs text-muted-foreground">...</span>
                  ) : data.error ? (
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                  ) : isEmpty ? (
                    <Badge variant="destructive" className="text-xs">
                      Empty
                    </Badge>
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
                      onClick={() =>
                        openMintModal({
                          id: tokenId,
                          symbol: data.symbol,
                          name: data.name,
                          totalSupply: data.totalSupply,
                          decimals: data.decimals,
                        })
                      }
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
          <div className="flex gap-2">
            <Select value={filterChain} onValueChange={setFilterChain}>
              <SelectTrigger className="w-32 input-dark">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Chains</SelectItem>
                <SelectItem value="SOLANA">Solana</SelectItem>
                <SelectItem value="ETHEREUM">Ethereum</SelectItem>
                <SelectItem value="POLYGON">Polygon</SelectItem>
                <SelectItem value="BSC">BSC</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32 input-dark">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Holdings List */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredHoldings.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No holdings match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredHoldings.map((holding) => {
              const status = getHoldingStatus(holding);
              const treasuryData = treasuryBalances[holding.token_definition.id];
              const treasuryBalance = treasuryData?.balance ?? 0;
              const deliveryAmount = deliveryAmounts[holding.id] || '';
              const maxAmount = Math.min(Number(holding.balance), treasuryBalance);

              return (
                <div key={holding.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-primary font-medium">
                          {holding.token_definition.token_symbol}
                        </span>
                        <Badge variant={status.color} className="text-xs">
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{holding.user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Balance: <span className="font-mono">{Number(holding.balance).toLocaleString()}</span>
                      </p>
                    </div>

                    {status.status === 'ready' && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="Amount"
                          value={deliveryAmount}
                          onChange={(e) =>
                            setDeliveryAmounts((prev) => ({
                              ...prev,
                              [holding.id]: e.target.value,
                            }))
                          }
                          className="w-28 input-dark"
                          min="0"
                          max={maxAmount}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDeliveryAmounts((prev) => ({
                              ...prev,
                              [holding.id]: maxAmount.toString(),
                            }))
                          }
                        >
                          Max
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleDeliver(holding, parseFloat(deliveryAmount))}
                          disabled={
                            isDelivering === holding.id ||
                            !deliveryAmount ||
                            parseFloat(deliveryAmount) <= 0 ||
                            parseFloat(deliveryAmount) > maxAmount
                          }
                        >
                          {isDelivering === holding.id ? (
                            <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-1" />
                              Deliver
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mint Modal */}
      <Dialog open={mintModalOpen} onOpenChange={setMintModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mint to Treasury</DialogTitle>
            <DialogDescription>
              Mint the full token supply to the treasury account for {mintingToken?.symbol}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">
              This will mint{' '}
              <span className="font-mono font-medium text-foreground">
                {mintingToken?.totalSupply.toLocaleString()}
              </span>{' '}
              tokens to the treasury.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMintModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMintToTreasury} disabled={isMinting}>
              {isMinting ? (
                <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Coins className="h-4 w-4 mr-2" />
              )}
              Mint Tokens
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
