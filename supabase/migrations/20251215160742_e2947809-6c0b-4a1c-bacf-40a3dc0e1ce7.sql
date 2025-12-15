-- Create ops_arbitrage_events table for detailed arbitrage logging
CREATE TABLE public.ops_arbitrage_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chain text NOT NULL DEFAULT 'EVM',
  network text NOT NULL DEFAULT 'POLYGON',
  mode text NOT NULL DEFAULT 'SIMULATION',
  strategy_id uuid REFERENCES public.arbitrage_strategies(id),
  run_id uuid REFERENCES public.arbitrage_runs(id),
  notional_in text,
  expected_gross_profit text,
  expected_net_profit text,
  realized_profit text,
  gas_used text,
  effective_gas_price text,
  tx_hash text,
  status text NOT NULL DEFAULT 'PENDING',
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ops_arbitrage_events ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage ops arbitrage events"
  ON public.ops_arbitrage_events
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX idx_ops_arbitrage_events_chain_network ON public.ops_arbitrage_events(chain, network);
CREATE INDEX idx_ops_arbitrage_events_created_at ON public.ops_arbitrage_events(created_at DESC);
CREATE INDEX idx_ops_arbitrage_events_status ON public.ops_arbitrage_events(status);