import { useEffect, useState, useCallback } from 'react';
import { Send, Inbox, ArrowRightLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { TransferRequestWithDetails } from '@/types/transfers';
import { SendTokensModal } from '@/components/transfers/SendTokensModal';
import { TransferRequestCard } from '@/components/transfers/TransferRequestCard';

export default function TransfersPage() {
  const { user } = useAuth();
  const [incomingRequests, setIncomingRequests] = useState<TransferRequestWithDetails[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<TransferRequestWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSendModal, setShowSendModal] = useState(false);

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Fetch incoming requests (where user is recipient)
      const { data: incoming, error: incomingError } = await supabase
        .from('transfer_requests')
        .select('*')
        .eq('to_user_id', user.id)
        .order('created_at', { ascending: false });

      if (incomingError) throw incomingError;

      // Fetch outgoing requests (where user is sender)
      const { data: outgoing, error: outgoingError } = await supabase
        .from('transfer_requests')
        .select('*')
        .eq('from_user_id', user.id)
        .order('created_at', { ascending: false });

      if (outgoingError) throw outgoingError;

      // Get all unique user IDs and token IDs
      const allRequests = [...(incoming || []), ...(outgoing || [])];
      const userIds = [...new Set(allRequests.flatMap(r => [r.from_user_id, r.to_user_id]))];
      const tokenIds = [...new Set(allRequests.map(r => r.token_definition_id))];

      // Fetch user profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, name')
        .in('id', userIds);

      // Fetch token definitions
      const { data: tokens } = await supabase
        .from('token_definitions')
        .select('id, token_name, token_symbol')
        .in('id', tokenIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const tokenMap = new Map(tokens?.map(t => [t.id, t]) || []);

      const enrichRequest = (r: any): TransferRequestWithDetails => {
        const fromUser = profileMap.get(r.from_user_id);
        const toUser = profileMap.get(r.to_user_id);
        const token = tokenMap.get(r.token_definition_id);
        return {
          ...r,
          from_user_email: fromUser?.email,
          from_user_name: fromUser?.name,
          to_user_email: toUser?.email,
          to_user_name: toUser?.name,
          token_symbol: token?.token_symbol,
          token_name: token?.token_name,
        };
      };

      setIncomingRequests((incoming || []).map(enrichRequest));
      setOutgoingRequests((outgoing || []).map(enrichRequest));
    } catch (error: any) {
      console.error('Error fetching transfer requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load transfer requests',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (requestId: string) => {
    try {
      // Get the request details
      const { data: request, error: fetchError } = await supabase
        .from('transfer_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchError || !request) throw fetchError || new Error('Request not found');

      // Check sender has enough balance
      const { data: senderHolding } = await supabase
        .from('user_token_holdings')
        .select('id, balance')
        .eq('user_id', request.from_user_id)
        .eq('token_definition_id', request.token_definition_id)
        .single();

      if (!senderHolding || senderHolding.balance < request.amount) {
        throw new Error('Sender has insufficient balance');
      }

      // Deduct from sender
      await supabase
        .from('user_token_holdings')
        .update({ balance: senderHolding.balance - request.amount })
        .eq('id', senderHolding.id);

      // Add to recipient (upsert)
      const { data: recipientHolding } = await supabase
        .from('user_token_holdings')
        .select('id, balance')
        .eq('user_id', request.to_user_id)
        .eq('token_definition_id', request.token_definition_id)
        .single();

      if (recipientHolding) {
        await supabase
          .from('user_token_holdings')
          .update({ balance: recipientHolding.balance + request.amount })
          .eq('id', recipientHolding.id);
      } else {
        await supabase
          .from('user_token_holdings')
          .insert({
            user_id: request.to_user_id,
            token_definition_id: request.token_definition_id,
            balance: request.amount,
          });
      }

      // Update request status
      await supabase
        .from('transfer_requests')
        .update({ status: 'APPROVED', resolved_at: new Date().toISOString() })
        .eq('id', requestId);

      toast({ title: 'Success', description: 'Transfer approved and completed' });
      fetchRequests();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve transfer',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await supabase
        .from('transfer_requests')
        .update({ status: 'REJECTED', resolved_at: new Date().toISOString() })
        .eq('id', requestId);

      toast({ title: 'Transfer rejected' });
      fetchRequests();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to reject transfer',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async (requestId: string) => {
    try {
      await supabase
        .from('transfer_requests')
        .update({ status: 'CANCELLED', resolved_at: new Date().toISOString() })
        .eq('id', requestId);

      toast({ title: 'Transfer cancelled' });
      fetchRequests();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to cancel transfer',
        variant: 'destructive',
      });
    }
  };

  const pendingIncoming = incomingRequests.filter(r => r.status === 'PENDING');
  const pendingOutgoing = outgoingRequests.filter(r => r.status === 'PENDING');

  return (
    <DashboardLayout
      title="Token Transfers"
      subtitle="Send and receive tokens with other users"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Header with Send button */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            {pendingIncoming.length > 0 && (
              <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                {pendingIncoming.length} pending request{pendingIncoming.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
          <Button onClick={() => setShowSendModal(true)}>
            <Send className="h-4 w-4" />
            Send Tokens
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="incoming" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="incoming" className="flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Incoming ({incomingRequests.length})
            </TabsTrigger>
            <TabsTrigger value="outgoing" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Sent ({outgoingRequests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="incoming" className="mt-6">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : incomingRequests.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <ArrowRightLeft className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No incoming transfers</h3>
                <p className="text-muted-foreground">
                  When someone sends you tokens, they'll appear here for you to accept.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {incomingRequests.map((request) => (
                  <TransferRequestCard
                    key={request.id}
                    request={request}
                    type="incoming"
                    onApprove={() => handleApprove(request.id)}
                    onReject={() => handleReject(request.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="outgoing" className="mt-6">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : outgoingRequests.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <Send className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No sent transfers</h3>
                <p className="text-muted-foreground">
                  Tokens you send to other users will appear here.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {outgoingRequests.map((request) => (
                  <TransferRequestCard
                    key={request.id}
                    request={request}
                    type="outgoing"
                    onCancel={() => handleCancel(request.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {showSendModal && (
        <SendTokensModal
          onClose={() => setShowSendModal(false)}
          onSuccess={() => {
            setShowSendModal(false);
            fetchRequests();
          }}
        />
      )}
    </DashboardLayout>
  );
}
