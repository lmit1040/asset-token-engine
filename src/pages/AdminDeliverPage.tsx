import { useEffect, useState } from 'react';
import { Search, Send, ExternalLink, AlertTriangle, CheckCircle2, Wallet } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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

export default function AdminDeliverPage() {
  const [holdings, setHoldings] = useState<HoldingWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDelivering, setIsDelivering] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChain, setFilterChain] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('ready');

  useEffect(() => {
    fetchHoldings();
  }, []);

  async function fetchHoldings() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_token_holdings')
        .select(`
          *,
          token_definition:token_definitions(*, asset:assets(*)),
          user:profiles(*)
        `)
        .gt('balance', 0)
        .order('assigned_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setHoldings(data as unknown as HoldingWithDetails[]);
      }
    } catch (error) {
      console.error('Error fetching holdings:', error);
      toast.error('Failed to load holdings');
    } finally {
      setIsLoading(false);
    }
  }

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

    // Status filter
    const isDeployed = token.deployment_status === 'DEPLOYED';
    const hasWallet =
      (token.chain === 'SOLANA' && user.solana_wallet_address) ||
      (['ETHEREUM', 'POLYGON', 'BSC'].includes(token.chain) && user.evm_wallet_address);
    const isReady = isDeployed && hasWallet && token.chain === 'SOLANA';

    if (filterStatus === 'ready') return matchesSearch && matchesChain && isReady;
    if (filterStatus === 'pending') return matchesSearch && matchesChain && (!isDeployed || !hasWallet);
    return matchesSearch && matchesChain;

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
                      <div className="flex items-center gap-2 mt-1 text-sm">
                        <span className="text-muted-foreground">Balance:</span>
                        <span className="font-mono text-foreground">
                          {Number(holding.balance).toLocaleString()}
                        </span>
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
