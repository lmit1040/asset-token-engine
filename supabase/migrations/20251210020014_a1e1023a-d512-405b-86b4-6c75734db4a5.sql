-- Create daily_risk_limits table for per-strategy per-day risk tracking

CREATE TABLE public.daily_risk_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES public.arbitrage_strategies(id) ON DELETE CASCADE,
  chain text NOT NULL,
  date date NOT NULL,
  total_trades integer NOT NULL DEFAULT 0,
  total_pnl_native bigint NOT NULL DEFAULT 0,
  total_loss_native bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, date)
);

-- Enable RLS
ALTER TABLE public.daily_risk_limits ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can manage daily risk limits"
ON public.daily_risk_limits
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_daily_risk_limits_updated_at
BEFORE UPDATE ON public.daily_risk_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.daily_risk_limits IS 'Tracks daily trading limits and PnL per arbitrage strategy';
COMMENT ON COLUMN public.daily_risk_limits.total_trades IS 'Number of trades executed today for this strategy';
COMMENT ON COLUMN public.daily_risk_limits.total_pnl_native IS 'Net profit/loss in native token units for the day';
COMMENT ON COLUMN public.daily_risk_limits.total_loss_native IS 'Cumulative loss (negative PnL trades only) in native units';