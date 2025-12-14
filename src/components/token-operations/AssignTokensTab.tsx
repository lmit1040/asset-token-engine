import { useEffect, useState } from 'react';
import { Search, Coins, UserPlus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Profile, TokenDefinition, Asset, TOKEN_MODEL_LABELS } from '@/types/database';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLogger';
import { sendTokenNotification } from '@/lib/sendTokenNotification';

interface TokenWithAsset extends TokenDefinition {
  asset: Asset;
}

export default function AssignTokensTab() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [tokens, setTokens] = useState<TokenWithAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [amount, setAmount] = useState('');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [usersRes, tokensRes] = await Promise.all([
        supabase.from('profiles').select('*').order('email'),
        supabase.from('token_definitions').select('*, asset:assets(*)').is('archived_at', null).order('token_name'),
      ]);

      if (usersRes.data) setUsers(usersRes.data as Profile[]);
      if (tokensRes.data) setTokens(tokensRes.data as unknown as TokenWithAsset[]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      user.name?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const selectedToken = tokens.find((t) => t.id === selectedTokenId);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUserId || !selectedTokenId || !amount || !currentUser) {
      toast.error('Please fill in all fields');
      return;
    }

    const assignAmount = parseFloat(amount);
    if (isNaN(assignAmount) || assignAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: existingHolding } = await supabase
        .from('user_token_holdings')
        .select('id, balance')
        .eq('user_id', selectedUserId)
        .eq('token_definition_id', selectedTokenId)
        .maybeSingle();

      const selectedUser = users.find((u) => u.id === selectedUserId);
      const token = tokens.find((t) => t.id === selectedTokenId);

      let deliveryWalletAddress: string | null = null;
      let deliveryWalletType: 'EVM' | 'SOLANA' | null = null;

      if (token) {
        const chain = token.chain;
        if (chain === 'ETHEREUM' || chain === 'POLYGON' || chain === 'BSC') {
          deliveryWalletAddress = selectedUser?.evm_wallet_address || null;
          deliveryWalletType = deliveryWalletAddress ? 'EVM' : null;
        } else if (chain === 'SOLANA') {
          deliveryWalletAddress = selectedUser?.solana_wallet_address || null;
          deliveryWalletType = deliveryWalletAddress ? 'SOLANA' : null;
        }
      }

      if (existingHolding) {
        const newBalance = Number(existingHolding.balance) + assignAmount;
        const { error } = await supabase
          .from('user_token_holdings')
          .update({
            balance: newBalance,
            assigned_by: currentUser.id,
            assigned_at: new Date().toISOString(),
            delivery_wallet_address: deliveryWalletAddress,
            delivery_wallet_type: deliveryWalletType,
          })
          .eq('id', existingHolding.id);

        if (error) throw error;
        toast.success(`Added ${assignAmount.toLocaleString()} tokens. New balance: ${newBalance.toLocaleString()}`);
      } else {
        const { error } = await supabase.from('user_token_holdings').insert({
          user_id: selectedUserId,
          token_definition_id: selectedTokenId,
          balance: assignAmount,
          assigned_by: currentUser.id,
          delivery_wallet_address: deliveryWalletAddress,
          delivery_wallet_type: deliveryWalletType,
        });

        if (error) throw error;
        toast.success(`Assigned ${assignAmount.toLocaleString()} tokens successfully`);
      }

      await logActivity({
        actionType: 'tokens_assigned',
        entityType: 'user_token_holding',
        entityName: `${token?.token_symbol} assignment`,
        details: {
          user_id: selectedUserId,
          user_email: selectedUser?.email,
          token_id: selectedTokenId,
          token_symbol: token?.token_symbol,
          amount: assignAmount,
        },
      });

      if (selectedUser && token) {
        sendTokenNotification({
          type: 'assignment',
          recipientEmail: selectedUser.email,
          recipientName: selectedUser.name,
          tokenSymbol: token.token_symbol,
          tokenName: token.token_name,
          amount: assignAmount,
        });
      }

      setAmount('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign tokens');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Assign Tokens</h2>
            <p className="text-sm text-muted-foreground">Create or add to user token holdings</p>
          </div>
        </div>

        <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border text-sm text-muted-foreground flex items-start gap-2">
          <ArrowRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <span>
            Tokens assigned here are recorded in the database. Use <strong>Deliver</strong> to send them to the user's
            blockchain wallet.
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-8">
            <Coins className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No token definitions available.</p>
            <p className="text-sm text-muted-foreground mt-1">Create token definitions for assets first.</p>
          </div>
        ) : (
          <form onSubmit={handleAssign} className="space-y-5">
            <div className="space-y-2">
              <Label>Select User</Label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-10 input-dark"
                />
              </div>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="input-dark">
                  <SelectValue placeholder="Choose a user" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{user.name || 'No name'}</span>
                        <span className="text-muted-foreground">({user.email})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Select Token</Label>
              <Select value={selectedTokenId} onValueChange={setSelectedTokenId}>
                <SelectTrigger className="input-dark">
                  <SelectValue placeholder="Choose a token" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {tokens.map((token) => (
                    <SelectItem key={token.id} value={token.id}>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-primary">{token.token_symbol}</span>
                        <span>{token.token_name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedToken && (
              <div className="bg-muted/30 rounded-lg p-4 border border-border">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{selectedToken.token_name}</p>
                    <p className="text-sm text-primary font-mono">{selectedToken.token_symbol}</p>
                  </div>
                  <span className="badge-gold text-xs">{TOKEN_MODEL_LABELS[selectedToken.token_model]}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Backing Asset</p>
                    <p className="text-foreground">{selectedToken.asset?.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Supply</p>
                    <p className="font-mono text-foreground">{Number(selectedToken.total_supply).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount to Assign</Label>
              <Input
                id="amount"
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter token amount"
                className="input-dark"
                required
              />
              <p className="text-xs text-muted-foreground">
                If the user already holds this token, the amount will be added to their existing balance.
              </p>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <div className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Coins className="h-4 w-4" />
                  Assign Tokens
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
