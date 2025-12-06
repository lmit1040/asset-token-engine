import { useEffect, useState } from 'react';
import { Search, ArrowRight, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Profile, TokenDefinition, Asset, UserTokenHolding, TOKEN_MODEL_LABELS } from '@/types/database';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLogger';

interface TokenWithAsset extends TokenDefinition {
  asset: Asset;
}

interface HoldingWithToken extends UserTokenHolding {
  token_definition: TokenWithAsset;
}

export default function AdminTransferPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [tokens, setTokens] = useState<TokenWithAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [amount, setAmount] = useState('');
  const [fromUserSearch, setFromUserSearch] = useState('');
  const [toUserSearch, setToUserSearch] = useState('');

  // Source user holdings
  const [fromUserHoldings, setFromUserHoldings] = useState<HoldingWithToken[]>([]);
  const [isLoadingHoldings, setIsLoadingHoldings] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (fromUserId) {
      fetchUserHoldings(fromUserId);
    } else {
      setFromUserHoldings([]);
      setSelectedTokenId('');
    }
  }, [fromUserId]);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [usersRes, tokensRes] = await Promise.all([
        supabase.from('profiles').select('*').order('email'),
        supabase.from('token_definitions').select('*, asset:assets(*)').order('token_name'),
      ]);

      if (usersRes.data) setUsers(usersRes.data as Profile[]);
      if (tokensRes.data) setTokens(tokensRes.data as unknown as TokenWithAsset[]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchUserHoldings(userId: string) {
    setIsLoadingHoldings(true);
    try {
      const { data } = await supabase
        .from('user_token_holdings')
        .select('*, token_definition:token_definitions(*, asset:assets(*))')
        .eq('user_id', userId)
        .gt('balance', 0);

      if (data) {
        setFromUserHoldings(data as unknown as HoldingWithToken[]);
      }
    } catch (error) {
      console.error('Error fetching holdings:', error);
    } finally {
      setIsLoadingHoldings(false);
    }
  }

  const filteredFromUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(fromUserSearch.toLowerCase()) ||
      user.name?.toLowerCase().includes(fromUserSearch.toLowerCase())
  );

  const filteredToUsers = users.filter(
    (user) =>
      user.id !== fromUserId &&
      (user.email.toLowerCase().includes(toUserSearch.toLowerCase()) ||
        user.name?.toLowerCase().includes(toUserSearch.toLowerCase()))
  );

  const selectedHolding = fromUserHoldings.find((h) => h.token_definition_id === selectedTokenId);
  const maxTransferAmount = selectedHolding ? Number(selectedHolding.balance) : 0;

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromUserId || !toUserId || !selectedTokenId || !amount || !currentUser) {
      toast.error('Please fill in all fields');
      return;
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (transferAmount > maxTransferAmount) {
      toast.error(`Amount exceeds available balance (${maxTransferAmount.toLocaleString()})`);
      return;
    }

    if (fromUserId === toUserId) {
      toast.error('Cannot transfer to the same user');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Decrease source user balance
      const newFromBalance = maxTransferAmount - transferAmount;
      const { error: fromError } = await supabase
        .from('user_token_holdings')
        .update({ balance: newFromBalance })
        .eq('user_id', fromUserId)
        .eq('token_definition_id', selectedTokenId);

      if (fromError) throw fromError;

      // 2. Increase or create destination user balance
      const { data: existingToHolding } = await supabase
        .from('user_token_holdings')
        .select('id, balance')
        .eq('user_id', toUserId)
        .eq('token_definition_id', selectedTokenId)
        .maybeSingle();

      if (existingToHolding) {
        const newToBalance = Number(existingToHolding.balance) + transferAmount;
        const { error: toError } = await supabase
          .from('user_token_holdings')
          .update({
            balance: newToBalance,
            assigned_by: currentUser.id,
            assigned_at: new Date().toISOString(),
          })
          .eq('id', existingToHolding.id);

        if (toError) throw toError;
      } else {
        const { error: createError } = await supabase
          .from('user_token_holdings')
          .insert({
            user_id: toUserId,
            token_definition_id: selectedTokenId,
            balance: transferAmount,
            assigned_by: currentUser.id,
          });

        if (createError) throw createError;
      }

      // 3. Log the activity
      const fromUser = users.find((u) => u.id === fromUserId);
      const toUser = users.find((u) => u.id === toUserId);
      const token = tokens.find((t) => t.id === selectedTokenId);

      await logActivity({
        actionType: 'tokens_transferred',
        entityType: 'user_token_holding',
        entityName: `${token?.token_symbol} transfer`,
        details: {
          from_user_id: fromUserId,
          from_user_email: fromUser?.email,
          to_user_id: toUserId,
          to_user_email: toUser?.email,
          token_id: selectedTokenId,
          token_symbol: token?.token_symbol,
          amount: transferAmount,
        },
      });

      toast.success(
        `Transferred ${transferAmount.toLocaleString()} ${token?.token_symbol} from ${fromUser?.email} to ${toUser?.email}`
      );

      // Reset form and refresh holdings
      setAmount('');
      setSelectedTokenId('');
      fetchUserHoldings(fromUserId);
    } catch (error: any) {
      toast.error(error.message || 'Failed to transfer tokens');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fromUser = users.find((u) => u.id === fromUserId);
  const toUser = users.find((u) => u.id === toUserId);

  return (
    <DashboardLayout title="Transfer Tokens" subtitle="Transfer token holdings between users" requireAdmin>
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <RefreshCw className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Token Transfer</h2>
              <p className="text-sm text-muted-foreground">Move tokens from one user to another</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleTransfer} className="space-y-6">
              {/* Transfer Direction */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-end">
                {/* From User */}
                <div className="space-y-2">
                  <Label>From User</Label>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={fromUserSearch}
                      onChange={(e) => setFromUserSearch(e.target.value)}
                      className="pl-10 input-dark"
                    />
                  </div>
                  <Select value={fromUserId} onValueChange={setFromUserId}>
                    <SelectTrigger className="input-dark">
                      <SelectValue placeholder="Select source user" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {filteredFromUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{user.name || 'No name'}</span>
                            <span className="text-muted-foreground text-xs">({user.email})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Arrow */}
                <div className="flex items-center justify-center pb-2">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <ArrowRight className="h-5 w-5 text-primary" />
                  </div>
                </div>

                {/* To User */}
                <div className="space-y-2">
                  <Label>To User</Label>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={toUserSearch}
                      onChange={(e) => setToUserSearch(e.target.value)}
                      className="pl-10 input-dark"
                    />
                  </div>
                  <Select value={toUserId} onValueChange={setToUserId}>
                    <SelectTrigger className="input-dark">
                      <SelectValue placeholder="Select destination user" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {filteredToUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{user.name || 'No name'}</span>
                            <span className="text-muted-foreground text-xs">({user.email})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Source User Holdings */}
              {fromUserId && (
                <div className="space-y-2">
                  <Label>Select Token to Transfer</Label>
                  {isLoadingHoldings ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : fromUserHoldings.length === 0 ? (
                    <div className="bg-muted/30 rounded-lg p-4 text-center">
                      <p className="text-muted-foreground text-sm">
                        This user has no token holdings to transfer.
                      </p>
                    </div>
                  ) : (
                    <Select value={selectedTokenId} onValueChange={setSelectedTokenId}>
                      <SelectTrigger className="input-dark">
                        <SelectValue placeholder="Choose a token" />
                      </SelectTrigger>
                      <SelectContent>
                        {fromUserHoldings.map((holding) => (
                          <SelectItem key={holding.token_definition_id} value={holding.token_definition_id}>
                            <span className="flex items-center gap-3">
                              <span className="font-mono text-primary">
                                {holding.token_definition.token_symbol}
                              </span>
                              <span>{holding.token_definition.token_name}</span>
                              <span className="text-muted-foreground text-xs">
                                (Balance: {Number(holding.balance).toLocaleString()})
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Selected Token Info */}
              {selectedHolding && (
                <div className="bg-muted/30 rounded-lg p-4 border border-border">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground">
                        {selectedHolding.token_definition.token_name}
                      </p>
                      <p className="text-sm text-primary font-mono">
                        {selectedHolding.token_definition.token_symbol}
                      </p>
                    </div>
                    <span className="badge-gold text-xs">
                      {TOKEN_MODEL_LABELS[selectedHolding.token_definition.token_model]}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Available Balance</p>
                      <p className="font-mono text-foreground text-lg">
                        {Number(selectedHolding.balance).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Backing Asset</p>
                      <p className="text-foreground">{selectedHolding.token_definition.asset?.name}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Amount */}
              {selectedHolding && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="amount">Amount to Transfer</Label>
                    <button
                      type="button"
                      onClick={() => setAmount(maxTransferAmount.toString())}
                      className="text-xs text-primary hover:underline"
                    >
                      Max: {maxTransferAmount.toLocaleString()}
                    </button>
                  </div>
                  <Input
                    id="amount"
                    type="number"
                    step="any"
                    min="0"
                    max={maxTransferAmount}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter transfer amount"
                    className="input-dark"
                    required
                  />
                </div>
              )}

              {/* Transfer Summary */}
              {fromUser && toUser && selectedHolding && amount && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <p className="text-sm text-foreground">
                    Transfer <span className="font-bold text-primary">{parseFloat(amount).toLocaleString()}</span>{' '}
                    <span className="font-mono">{selectedHolding.token_definition.token_symbol}</span> from{' '}
                    <span className="font-medium">{fromUser.email}</span> to{' '}
                    <span className="font-medium">{toUser.email}</span>
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting || !fromUserId || !toUserId || !selectedTokenId || !amount}
              >
                {isSubmitting ? (
                  <div className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Transfer Tokens
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}