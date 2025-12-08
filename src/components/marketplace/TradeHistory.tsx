import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MarketplaceTrade } from '@/types/marketplace';

interface TradeHistoryProps {
  trades: MarketplaceTrade[];
  currentUserId?: string;
  isLoading?: boolean;
}

export function TradeHistory({ trades, currentUserId, isLoading }: TradeHistoryProps) {
  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Recent Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading trades...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg">Recent Trades</CardTitle>
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            No trades yet
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => {
                const isBuyer = currentUserId === trade.buyer_id;
                const isSeller = currentUserId === trade.seller_id;
                const side = isBuyer ? 'BOUGHT' : isSeller ? 'SOLD' : '—';
                const total = Number(trade.quantity) * Number(trade.price_per_token);

                return (
                  <TableRow key={trade.id}>
                    <TableCell className="font-medium">
                      {trade.token_definition?.token_symbol || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          isBuyer
                            ? 'bg-success/10 text-success border-success/20'
                            : 'bg-destructive/10 text-destructive border-destructive/20'
                        }
                      >
                        {side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(trade.quantity).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${Number(trade.price_per_token).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(trade.executed_at), 'MMM d, HH:mm:ss')}
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
