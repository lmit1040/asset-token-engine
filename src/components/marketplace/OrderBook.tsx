import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MarketplaceOrder, OrderBookLevel } from '@/types/marketplace';

interface OrderBookProps {
  orders: MarketplaceOrder[];
  tokenSymbol: string;
  isLoading?: boolean;
}

export function OrderBook({ orders, tokenSymbol, isLoading }: OrderBookProps) {
  const { bids, asks, maxQuantity } = useMemo(() => {
    const buyOrders = orders.filter(o => o.order_type === 'BUY' && o.status === 'OPEN');
    const sellOrders = orders.filter(o => o.order_type === 'SELL' && o.status === 'OPEN');

    // Aggregate by price level
    const aggregateLevels = (orderList: MarketplaceOrder[]): OrderBookLevel[] => {
      const levelMap = new Map<number, { quantity: number; orderCount: number }>();
      
      orderList.forEach(order => {
        const price = Number(order.price_per_token);
        const remaining = Number(order.quantity) - Number(order.filled_quantity);
        const existing = levelMap.get(price) || { quantity: 0, orderCount: 0 };
        levelMap.set(price, {
          quantity: existing.quantity + remaining,
          orderCount: existing.orderCount + 1,
        });
      });

      return Array.from(levelMap.entries()).map(([price, data]) => ({
        price,
        quantity: data.quantity,
        orderCount: data.orderCount,
      }));
    };

    const bidLevels = aggregateLevels(buyOrders).sort((a, b) => b.price - a.price).slice(0, 10);
    const askLevels = aggregateLevels(sellOrders).sort((a, b) => a.price - b.price).slice(0, 10);

    const allQuantities = [...bidLevels, ...askLevels].map(l => l.quantity);
    const max = Math.max(...allQuantities, 1);

    return { bids: bidLevels, asks: askLevels, maxQuantity: max };
  }, [orders]);

  const renderLevel = (level: OrderBookLevel, type: 'bid' | 'ask') => {
    const percentage = (level.quantity / maxQuantity) * 100;
    const isBid = type === 'bid';

    return (
      <div
        key={`${type}-${level.price}`}
        className="relative flex items-center justify-between px-3 py-1.5 text-sm font-mono"
      >
        <div
          className={cn(
            'absolute inset-0 opacity-20',
            isBid ? 'bg-success' : 'bg-destructive'
          )}
          style={{ width: `${percentage}%`, [isBid ? 'right' : 'left']: 0 }}
        />
        <span className={cn('relative z-10', isBid ? 'text-success' : 'text-destructive')}>
          ${level.price.toFixed(2)}
        </span>
        <span className="relative z-10 text-muted-foreground">
          {level.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Order Book</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading order book...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Order Book — {tokenSymbol}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Asks (Sell orders) - reversed so lowest is at bottom */}
        <div>
          <div className="flex items-center justify-between px-3 py-1 text-xs font-medium text-muted-foreground border-b border-border">
            <span>Ask Price</span>
            <span>Quantity</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {asks.length > 0 ? (
              [...asks].reverse().map(level => renderLevel(level, 'ask'))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No sell orders
              </div>
            )}
          </div>
        </div>

        {/* Spread indicator */}
        <div className="flex items-center justify-center py-2 border-y border-border">
          <span className="text-xs text-muted-foreground">
            Spread: ${bids[0] && asks[0] ? (asks[0].price - bids[0].price).toFixed(2) : '—'}
          </span>
        </div>

        {/* Bids (Buy orders) */}
        <div>
          <div className="flex items-center justify-between px-3 py-1 text-xs font-medium text-muted-foreground border-b border-border">
            <span>Bid Price</span>
            <span>Quantity</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {bids.length > 0 ? (
              bids.map(level => renderLevel(level, 'bid'))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No buy orders
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
