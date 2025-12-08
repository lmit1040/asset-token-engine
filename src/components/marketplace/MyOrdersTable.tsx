import { useState } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { MarketplaceOrder } from '@/types/marketplace';

interface MyOrdersTableProps {
  orders: MarketplaceOrder[];
  isLoading?: boolean;
  onOrderCancelled: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  PARTIALLY_FILLED: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  FILLED: 'bg-success/10 text-success border-success/20',
  CANCELLED: 'bg-muted text-muted-foreground border-muted',
};

export function MyOrdersTable({ orders, isLoading, onOrderCancelled }: MyOrdersTableProps) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      const { error } = await supabase
        .from('marketplace_orders')
        .update({ status: 'CANCELLED' })
        .eq('id', orderId);

      if (error) throw error;

      toast.success('Order cancelled');
      onOrderCancelled();
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order', { description: error.message });
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">My Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading orders...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg">My Orders</CardTitle>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            No orders placed yet
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Filled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const remaining = Number(order.quantity) - Number(order.filled_quantity);
                const canCancel = order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED';

                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          order.order_type === 'BUY'
                            ? 'bg-success/10 text-success border-success/20'
                            : 'bg-destructive/10 text-destructive border-destructive/20'
                        )}
                      >
                        {order.order_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {order.token_definition?.token_symbol || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(order.quantity).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${Number(order.price_per_token).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {Number(order.filled_quantity).toLocaleString()} / {Number(order.quantity).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[order.status]}>
                        {order.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(order.created_at), 'MMM d, HH:mm')}
                    </TableCell>
                    <TableCell>
                      {canCancel && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCancel(order.id)}
                          disabled={cancellingId === order.id}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
