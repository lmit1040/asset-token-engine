import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { OrderType } from '@/types/marketplace';

interface CreateOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenDefinitionId: string;
  tokenSymbol: string;
  tokenName: string;
  userBalance: number;
  onOrderCreated: () => void;
}

export function CreateOrderModal({
  open,
  onOpenChange,
  tokenDefinitionId,
  tokenSymbol,
  tokenName,
  userBalance,
  onOrderCreated,
}: CreateOrderModalProps) {
  const { user } = useAuth();
  const [orderType, setOrderType] = useState<OrderType>('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quantityNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(price) || 0;
  const totalValue = quantityNum * priceNum;

  const canSubmit = quantityNum > 0 && priceNum > 0 && (orderType === 'BUY' || quantityNum <= userBalance);

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;

    setIsSubmitting(true);
    try {
      // For sell orders, verify user has enough balance
      if (orderType === 'SELL' && quantityNum > userBalance) {
        toast.error('Insufficient balance', {
          description: `You only have ${userBalance} ${tokenSymbol} available.`,
        });
        return;
      }

      const { data: order, error } = await supabase.from('marketplace_orders').insert({
        user_id: user.id,
        token_definition_id: tokenDefinitionId,
        order_type: orderType,
        quantity: quantityNum,
        price_per_token: priceNum,
        status: 'OPEN',
      }).select().single();

      if (error) throw error;

      toast.success('Order placed', {
        description: `${orderType} order for ${quantityNum} ${tokenSymbol} at $${priceNum} each.`,
      });

      // Trigger order matching via edge function
      supabase.functions.invoke('execute-trade', {
        body: { order_id: order.id },
      }).then(({ error: matchError }) => {
        if (matchError) {
          console.error('Order matching error:', matchError);
        }
      });

      // Reset form
      setQuantity('');
      setPrice('');
      onOrderCreated();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast.error('Failed to place order', {
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Place Order — {tokenSymbol}</DialogTitle>
          <DialogDescription>{tokenName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Type Toggle */}
          <div className="space-y-2">
            <Label>Order Type</Label>
            <ToggleGroup
              type="single"
              value={orderType}
              onValueChange={(value) => value && setOrderType(value as OrderType)}
              className="w-full"
            >
              <ToggleGroupItem
                value="BUY"
                className="flex-1 data-[state=on]:bg-success data-[state=on]:text-success-foreground"
              >
                Buy
              </ToggleGroupItem>
              <ToggleGroupItem
                value="SELL"
                className="flex-1 data-[state=on]:bg-destructive data-[state=on]:text-destructive-foreground"
              >
                Sell
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="quantity">Quantity</Label>
              {orderType === 'SELL' && (
                <span className="text-xs text-muted-foreground">
                  Available: {userBalance.toLocaleString()} {tokenSymbol}
                </span>
              )}
            </div>
            <Input
              id="quantity"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {orderType === 'SELL' && quantityNum > userBalance && (
              <p className="text-xs text-destructive">Insufficient balance</p>
            )}
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="price">Price per Token (USD)</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          {/* Total Value */}
          <div className="rounded-lg bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Value</span>
              <span className="text-lg font-semibold">
                ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={orderType === 'BUY' ? 'w-full bg-success hover:bg-success/90' : 'w-full bg-destructive hover:bg-destructive/90'}
          >
            {isSubmitting ? 'Placing Order...' : `Place ${orderType} Order`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
