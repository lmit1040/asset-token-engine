import { useState, useEffect } from 'react';
import { X, Send, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface SendTokensModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface UserHolding {
  token_definition_id: string;
  balance: number;
  token_symbol: string;
  token_name: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
}

export function SendTokensModal({ onClose, onSuccess }: SendTokensModalProps) {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState<UserHolding[]>([]);
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<UserProfile | null>(null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    async function fetchHoldings() {
      if (!user) return;
      
      const { data: holdingsData } = await supabase
        .from('user_token_holdings')
        .select('token_definition_id, balance')
        .eq('user_id', user.id)
        .gt('balance', 0);

      if (holdingsData && holdingsData.length > 0) {
        const tokenIds = holdingsData.map(h => h.token_definition_id);
        const { data: tokens } = await supabase
          .from('token_definitions')
          .select('id, token_name, token_symbol')
          .in('id', tokenIds)
          .is('archived_at', null);

        const tokenMap = new Map(tokens?.map(t => [t.id, t]) || []);
        
        setHoldings(holdingsData.map(h => ({
          ...h,
          token_symbol: tokenMap.get(h.token_definition_id)?.token_symbol || '',
          token_name: tokenMap.get(h.token_definition_id)?.token_name || '',
        })));
      }
    }
    fetchHoldings();
  }, [user]);

  const handleSearch = async () => {
    if (!recipientSearch.trim() || recipientSearch.length < 3) return;
    
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name')
        .or(`email.ilike.%${recipientSearch}%,name.ilike.%${recipientSearch}%`)
        .neq('id', user?.id)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const selectedHolding = holdings.find(h => h.token_definition_id === selectedToken);
  const maxAmount = selectedHolding?.balance || 0;

  const handleSubmit = async () => {
    if (!user || !selectedToken || !selectedRecipient || !amount) return;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Error', description: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (amountNum > maxAmount) {
      toast({ title: 'Error', description: 'Insufficient balance', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('transfer_requests')
        .insert({
          token_definition_id: selectedToken,
          from_user_id: user.id,
          to_user_id: selectedRecipient.id,
          amount: amountNum,
          message: message.trim() || null,
        });

      if (error) throw error;

      toast({ title: 'Success', description: 'Transfer request sent' });
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send transfer request',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Send Tokens</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Token Selection */}
          <div className="space-y-2">
            <Label>Select Token</Label>
            <Select value={selectedToken} onValueChange={setSelectedToken}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a token to send" />
              </SelectTrigger>
              <SelectContent>
                {holdings.map((h) => (
                  <SelectItem key={h.token_definition_id} value={h.token_definition_id}>
                    {h.token_symbol} - Balance: {h.balance.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {holdings.length === 0 && (
              <p className="text-sm text-muted-foreground">You have no tokens to send</p>
            )}
          </div>

          {/* Recipient Search */}
          <div className="space-y-2">
            <Label>Recipient</Label>
            {selectedRecipient ? (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">
                    {selectedRecipient.name || selectedRecipient.email}
                  </p>
                  {selectedRecipient.name && (
                    <p className="text-sm text-muted-foreground">{selectedRecipient.email}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedRecipient(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by email or name..."
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button variant="outline" onClick={handleSearch} disabled={isSearching}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                {searchResults.length > 0 && (
                  <div className="border rounded-lg divide-y">
                    {searchResults.map((profile) => (
                      <button
                        key={profile.id}
                        className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setSelectedRecipient(profile);
                          setSearchResults([]);
                        }}
                      >
                        <p className="font-medium text-foreground">
                          {profile.name || profile.email}
                        </p>
                        {profile.name && (
                          <p className="text-sm text-muted-foreground">{profile.email}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>Amount</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                max={maxAmount}
                min={0}
              />
              {selectedHolding && (
                <Button
                  variant="outline"
                  onClick={() => setAmount(maxAmount.toString())}
                >
                  Max
                </Button>
              )}
            </div>
            {selectedHolding && (
              <p className="text-sm text-muted-foreground">
                Available: {maxAmount.toLocaleString()} {selectedHolding.token_symbol}
              </p>
            )}
          </div>

          {/* Optional Message */}
          <div className="space-y-2">
            <Label>Message (optional)</Label>
            <Textarea
              placeholder="Add a note for the recipient..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedToken || !selectedRecipient || !amount || isSubmitting}
          >
            {isSubmitting ? (
              <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Request
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
