-- Create enum for arbitrage run status
CREATE TYPE public.arbitrage_run_status AS ENUM ('SIMULATED', 'EXECUTED', 'FAILED');

-- Create arbitrage_strategies table
CREATE TABLE public.arbitrage_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dex_a TEXT NOT NULL,
  dex_b TEXT NOT NULL,
  token_in_mint TEXT NOT NULL,
  token_out_mint TEXT NOT NULL,
  min_profit_lamports BIGINT NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create arbitrage_runs table
CREATE TABLE public.arbitrage_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.arbitrage_strategies(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status public.arbitrage_run_status NOT NULL,
  estimated_profit_lamports BIGINT,
  actual_profit_lamports BIGINT,
  tx_signature TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_arbitrage_strategies_is_enabled ON public.arbitrage_strategies(is_enabled);
CREATE INDEX idx_arbitrage_runs_strategy_id ON public.arbitrage_runs(strategy_id);
CREATE INDEX idx_arbitrage_runs_status ON public.arbitrage_runs(status);
CREATE INDEX idx_arbitrage_runs_started_at ON public.arbitrage_runs(started_at DESC);

-- Enable RLS
ALTER TABLE public.arbitrage_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arbitrage_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for arbitrage_strategies (admin-only)
CREATE POLICY "Admins can manage arbitrage strategies"
ON public.arbitrage_strategies
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for arbitrage_runs (admin-only)
CREATE POLICY "Admins can manage arbitrage runs"
ON public.arbitrage_runs
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_arbitrage_strategies_updated_at
  BEFORE UPDATE ON public.arbitrage_strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_arbitrage_runs_updated_at
  BEFORE UPDATE ON public.arbitrage_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();