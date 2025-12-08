-- Create order type enum
CREATE TYPE order_type AS ENUM ('BUY', 'SELL');

-- Create order status enum
CREATE TYPE order_status AS ENUM ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED');

-- Create marketplace_orders table
CREATE TABLE public.marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_definition_id UUID NOT NULL REFERENCES public.token_definitions(id) ON DELETE CASCADE,
  order_type order_type NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  filled_quantity NUMERIC NOT NULL DEFAULT 0 CHECK (filled_quantity >= 0),
  price_per_token NUMERIC NOT NULL CHECK (price_per_token > 0),
  status order_status NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create marketplace_trades table
CREATE TABLE public.marketplace_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buy_order_id UUID NOT NULL REFERENCES public.marketplace_orders(id),
  sell_order_id UUID NOT NULL REFERENCES public.marketplace_orders(id),
  buyer_id UUID NOT NULL REFERENCES public.profiles(id),
  seller_id UUID NOT NULL REFERENCES public.profiles(id),
  token_definition_id UUID NOT NULL REFERENCES public.token_definitions(id),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  price_per_token NUMERIC NOT NULL CHECK (price_per_token > 0),
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_marketplace_orders_token ON public.marketplace_orders(token_definition_id);
CREATE INDEX idx_marketplace_orders_user ON public.marketplace_orders(user_id);
CREATE INDEX idx_marketplace_orders_status ON public.marketplace_orders(status);
CREATE INDEX idx_marketplace_orders_type_price ON public.marketplace_orders(order_type, price_per_token);
CREATE INDEX idx_marketplace_trades_token ON public.marketplace_trades(token_definition_id);
CREATE INDEX idx_marketplace_trades_buyer ON public.marketplace_trades(buyer_id);
CREATE INDEX idx_marketplace_trades_seller ON public.marketplace_trades(seller_id);

-- Enable RLS
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_trades ENABLE ROW LEVEL SECURITY;

-- RLS policies for marketplace_orders
CREATE POLICY "Anyone can view open orders"
ON public.marketplace_orders
FOR SELECT
USING (status = 'OPEN' OR user_id = auth.uid());

CREATE POLICY "Users can create their own orders"
ON public.marketplace_orders
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own orders"
ON public.marketplace_orders
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all orders"
ON public.marketplace_orders
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS policies for marketplace_trades
CREATE POLICY "Users can view their own trades"
ON public.marketplace_trades
FOR SELECT
USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "Admins can view all trades"
ON public.marketplace_trades
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert trades"
ON public.marketplace_trades
FOR INSERT
WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id OR has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_marketplace_orders_updated_at
BEFORE UPDATE ON public.marketplace_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for order book updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_trades;