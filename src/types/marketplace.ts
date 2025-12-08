export type OrderType = 'BUY' | 'SELL';
export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';

export interface MarketplaceOrder {
  id: string;
  user_id: string;
  token_definition_id: string;
  order_type: OrderType;
  quantity: number;
  filled_quantity: number;
  price_per_token: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  // Joined fields
  user?: {
    email: string;
    name: string | null;
  };
  token_definition?: {
    token_name: string;
    token_symbol: string;
    decimals: number;
  };
}

export interface MarketplaceTrade {
  id: string;
  buy_order_id: string;
  sell_order_id: string;
  buyer_id: string;
  seller_id: string;
  token_definition_id: string;
  quantity: number;
  price_per_token: number;
  executed_at: string;
  // Joined fields
  token_definition?: {
    token_name: string;
    token_symbol: string;
  };
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface OrderBook {
  bids: OrderBookLevel[]; // Buy orders (highest price first)
  asks: OrderBookLevel[]; // Sell orders (lowest price first)
}
