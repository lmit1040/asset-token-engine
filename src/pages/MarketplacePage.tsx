import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Store, Plus, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OrderBook } from '@/components/marketplace/OrderBook';
import { CreateOrderModal } from '@/components/marketplace/CreateOrderModal';
import { MyOrdersTable } from '@/components/marketplace/MyOrdersTable';
import { TradeHistory } from '@/components/marketplace/TradeHistory';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { MarketplaceOrder, MarketplaceTrade } from '@/types/marketplace';

interface TokenOption {
  id: string;
  token_name: string;
  token_symbol: string;
  decimals: number;
}

export default function MarketplacePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTokenId, setSelectedTokenId] = useState<string>('');
  const [showCreateOrder, setShowCreateOrder] = useState(false);

  // Fetch tradeable tokens (deployed tokens only)
  const { data: tokens = [] } = useQuery({
    queryKey: ['marketplace-tokens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_definitions')
        .select('id, token_name, token_symbol, decimals')
        .eq('deployment_status', 'DEPLOYED')
        .order('token_symbol');
      
      if (error) throw error;
      return data as TokenOption[];
    },
  });

  // Set default token when tokens load
  useEffect(() => {
    if (tokens.length > 0 && !selectedTokenId) {
      setSelectedTokenId(tokens[0].id);
    }
  }, [tokens, selectedTokenId]);

  const selectedToken = tokens.find(t => t.id === selectedTokenId);

  // Fetch orders for selected token
  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['marketplace-orders', selectedTokenId],
    queryFn: async () => {
      if (!selectedTokenId) return [];
      
      const { data, error } = await supabase
        .from('marketplace_orders')
        .select('*')
        .eq('token_definition_id', selectedTokenId)
        .in('status', ['OPEN', 'PARTIALLY_FILLED'])
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as MarketplaceOrder[];
    },
    enabled: !!selectedTokenId,
  });

  // Fetch user's orders
  const { data: myOrders = [], isLoading: myOrdersLoading, refetch: refetchMyOrders } = useQuery({
    queryKey: ['my-orders', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('marketplace_orders')
        .select(`
          *,
          token_definition:token_definitions(token_name, token_symbol, decimals)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as MarketplaceOrder[];
    },
    enabled: !!user,
  });

  // Fetch user's trades
  const { data: myTrades = [], isLoading: tradesLoading } = useQuery({
    queryKey: ['my-trades', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('marketplace_trades')
        .select(`
          *,
          token_definition:token_definitions(token_name, token_symbol)
        `)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('executed_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as MarketplaceTrade[];
    },
    enabled: !!user,
  });

  // Fetch user's balance for selected token
  const { data: userBalance = 0 } = useQuery({
    queryKey: ['user-token-balance', user?.id, selectedTokenId],
    queryFn: async () => {
      if (!user || !selectedTokenId) return 0;
      
      const { data, error } = await supabase
        .from('user_token_holdings')
        .select('balance')
        .eq('user_id', user.id)
        .eq('token_definition_id', selectedTokenId)
        .maybeSingle();
      
      if (error) throw error;
      return Number(data?.balance || 0);
    },
    enabled: !!user && !!selectedTokenId,
  });

  // Subscribe to realtime order updates
  useEffect(() => {
    if (!selectedTokenId) return;

    const channel = supabase
      .channel('marketplace-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'marketplace_orders',
          filter: `token_definition_id=eq.${selectedTokenId}`,
        },
        () => {
          refetchOrders();
          refetchMyOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTokenId, refetchOrders, refetchMyOrders]);

  const handleRefresh = () => {
    refetchOrders();
    refetchMyOrders();
    queryClient.invalidateQueries({ queryKey: ['my-trades'] });
  };

  const handleOrderCreated = () => {
    refetchOrders();
    refetchMyOrders();
  };

  return (
    <DashboardLayout title="Token Marketplace" subtitle="Trade tokens with other users">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gold-gradient flex items-center justify-center">
              <Store className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Token Marketplace</h1>
              <p className="text-sm text-muted-foreground">Trade tokens with other users</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select value={selectedTokenId} onValueChange={setSelectedTokenId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select token" />
              </SelectTrigger>
              <SelectContent>
                {tokens.map((token) => (
                  <SelectItem key={token.id} value={token.id}>
                    {token.token_symbol} — {token.token_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>

            <Button onClick={() => setShowCreateOrder(true)} disabled={!selectedTokenId}>
              <Plus className="h-4 w-4 mr-2" />
              Place Order
            </Button>
          </div>
        </div>

        {/* User Balance Banner */}
        {selectedToken && (
          <div className="rounded-lg bg-muted/50 border border-border p-4 flex items-center justify-between">
            <div>
              <span className="text-sm text-muted-foreground">Your {selectedToken.token_symbol} Balance</span>
              <p className="text-xl font-bold">{userBalance.toLocaleString()} {selectedToken.token_symbol}</p>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Order Book */}
          <div className="lg:col-span-1">
            <OrderBook
              orders={orders}
              tokenSymbol={selectedToken?.token_symbol || '—'}
              isLoading={ordersLoading}
            />
          </div>

          {/* My Orders & Trades */}
          <div className="lg:col-span-2 space-y-6">
            <MyOrdersTable
              orders={myOrders}
              isLoading={myOrdersLoading}
              onOrderCancelled={handleOrderCreated}
            />

            <TradeHistory
              trades={myTrades}
              currentUserId={user?.id}
              isLoading={tradesLoading}
            />
          </div>
        </div>
      </div>

      {/* Create Order Modal */}
      {selectedToken && (
        <CreateOrderModal
          open={showCreateOrder}
          onOpenChange={setShowCreateOrder}
          tokenDefinitionId={selectedTokenId}
          tokenSymbol={selectedToken.token_symbol}
          tokenName={selectedToken.token_name}
          userBalance={userBalance}
          onOrderCreated={handleOrderCreated}
        />
      )}
    </DashboardLayout>
  );
}
