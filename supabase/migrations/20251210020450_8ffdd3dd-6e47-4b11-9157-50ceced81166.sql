-- Extend arbitrage_runs table for auto-execution support

ALTER TABLE public.arbitrage_runs
ADD COLUMN approved_for_auto_execution boolean NOT NULL DEFAULT false,
ADD COLUMN estimated_gas_cost_native bigint DEFAULT 0,
ADD COLUMN run_type text DEFAULT 'SCAN',
ADD COLUMN purpose text DEFAULT 'MANUAL',
ADD COLUMN auto_executed boolean NOT NULL DEFAULT false;

-- Add constraint for run_type
ALTER TABLE public.arbitrage_runs
ADD CONSTRAINT valid_run_type CHECK (run_type IN ('SCAN', 'EXECUTE'));

-- Add constraint for purpose  
ALTER TABLE public.arbitrage_runs
ADD CONSTRAINT valid_purpose CHECK (purpose IN ('FEE_PAYER_REFILL', 'OPS_REFILL', 'TREASURY_OPTIMIZATION', 'MANUAL'));

-- Index for finding approved runs
CREATE INDEX idx_arbitrage_runs_approved 
ON public.arbitrage_runs (approved_for_auto_execution, status) 
WHERE approved_for_auto_execution = true;

-- Comments
COMMENT ON COLUMN public.arbitrage_runs.approved_for_auto_execution IS 'Decision engine approved this run for auto-execution';
COMMENT ON COLUMN public.arbitrage_runs.estimated_gas_cost_native IS 'Estimated gas cost in native token base units';
COMMENT ON COLUMN public.arbitrage_runs.run_type IS 'SCAN (simulation only) or EXECUTE (actual trade)';
COMMENT ON COLUMN public.arbitrage_runs.purpose IS 'Why this run was triggered';
COMMENT ON COLUMN public.arbitrage_runs.auto_executed IS 'Whether this was executed by automation vs manual';