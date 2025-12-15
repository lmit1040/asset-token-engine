-- Create ops_arbitrage_alerts table for PnL discrepancy tracking
CREATE TABLE public.ops_arbitrage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  network TEXT NOT NULL DEFAULT 'polygon',
  chain TEXT NOT NULL DEFAULT 'EVM',
  run_id UUID REFERENCES public.ops_arbitrage_events(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  expected_net_profit TEXT,
  realized_profit TEXT,
  gas_spent TEXT,
  details_json JSONB,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP WITH TIME ZONE
);

-- Add arb_execution_locked flag to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS arb_execution_locked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS arb_execution_locked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS arb_execution_locked_reason TEXT;

-- Enable RLS
ALTER TABLE public.ops_arbitrage_alerts ENABLE ROW LEVEL SECURITY;

-- Admin-only RLS policy
CREATE POLICY "Admins can manage ops arbitrage alerts"
ON public.ops_arbitrage_alerts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient querying
CREATE INDEX idx_ops_arbitrage_alerts_created_at ON public.ops_arbitrage_alerts(created_at DESC);
CREATE INDEX idx_ops_arbitrage_alerts_run_id ON public.ops_arbitrage_alerts(run_id);