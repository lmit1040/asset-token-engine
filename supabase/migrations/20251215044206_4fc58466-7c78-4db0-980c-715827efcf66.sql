-- Create table to track detected new token pools
CREATE TABLE public.detected_pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chain TEXT NOT NULL DEFAULT 'POLYGON',
  dex TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  token0_address TEXT NOT NULL,
  token1_address TEXT NOT NULL,
  token0_symbol TEXT,
  token1_symbol TEXT,
  liquidity_usd NUMERIC,
  created_block BIGINT,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  first_trade_at TIMESTAMP WITH TIME ZONE,
  is_rug_risk BOOLEAN DEFAULT false,
  rug_risk_reasons TEXT[],
  arbitrage_attempted BOOLEAN DEFAULT false,
  arbitrage_result TEXT,
  status TEXT NOT NULL DEFAULT 'NEW', -- NEW, MONITORING, TRADED, SKIPPED, RUG_DETECTED
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.detected_pools ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage detected pools"
  ON public.detected_pools
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for quick lookups
CREATE INDEX idx_detected_pools_status ON public.detected_pools(status);
CREATE INDEX idx_detected_pools_chain_dex ON public.detected_pools(chain, dex);
CREATE UNIQUE INDEX idx_detected_pools_unique ON public.detected_pools(chain, pool_address);

-- Add trigger for updated_at
CREATE TRIGGER update_detected_pools_updated_at
  BEFORE UPDATE ON public.detected_pools
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();