-- Enable pg_cron and pg_net extensions for scheduled HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create automation_logs table to track each cron cycle
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cycle_finished_at TIMESTAMPTZ,
  trigger_type TEXT NOT NULL DEFAULT 'cron', -- 'cron' or 'manual'
  scan_solana_result JSONB,
  scan_evm_result JSONB,
  decision_result JSONB,
  execution_result JSONB,
  wallet_check_result JSONB,
  overall_status TEXT NOT NULL DEFAULT 'RUNNING', -- 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can access automation logs
CREATE POLICY "Admins can manage automation logs" 
ON public.automation_logs 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient querying
CREATE INDEX idx_automation_logs_cycle_started ON public.automation_logs(cycle_started_at DESC);
CREATE INDEX idx_automation_logs_status ON public.automation_logs(overall_status);