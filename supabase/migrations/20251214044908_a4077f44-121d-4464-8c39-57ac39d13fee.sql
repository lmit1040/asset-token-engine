-- Add mainnet configuration columns to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS is_mainnet_mode boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS mainnet_min_fee_payer_balance_sol numeric NOT NULL DEFAULT 0.1,
ADD COLUMN IF NOT EXISTS mainnet_fee_payer_top_up_sol numeric NOT NULL DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS mainnet_min_profit_to_gas_ratio numeric NOT NULL DEFAULT 3.0,
ADD COLUMN IF NOT EXISTS evm_min_fee_payer_balance_native numeric NOT NULL DEFAULT 0.05,
ADD COLUMN IF NOT EXISTS evm_fee_payer_top_up_native numeric NOT NULL DEFAULT 0.2;

-- Create rate limiting tracking table
CREATE TABLE IF NOT EXISTS public.rate_limit_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address text NOT NULL,
  endpoint text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_endpoint_window 
ON public.rate_limit_tracking (ip_address, endpoint, window_start);

-- Enable RLS
ALTER TABLE public.rate_limit_tracking ENABLE ROW LEVEL SECURITY;

-- Allow edge functions to manage rate limits (service role only)
CREATE POLICY "Service role can manage rate limits"
ON public.rate_limit_tracking
FOR ALL
USING (true)
WITH CHECK (true);

-- Clean up old rate limit records (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_tracking 
  WHERE window_start < now() - interval '1 hour';
END;
$$;