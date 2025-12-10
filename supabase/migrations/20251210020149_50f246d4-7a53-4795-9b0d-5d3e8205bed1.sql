-- Create wallet_refill_requests table for tracking refill tasks

CREATE TABLE public.wallet_refill_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_type text NOT NULL,
  wallet_address text NOT NULL,
  chain text NOT NULL,
  reason text NOT NULL,
  required_amount_native bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  fulfilled_at timestamp with time zone DEFAULT NULL,
  fulfilled_by_run_id uuid REFERENCES public.arbitrage_runs(id) DEFAULT NULL,
  error_message text DEFAULT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('PENDING', 'FULFILLED', 'FAILED'))
);

-- Enable RLS
ALTER TABLE public.wallet_refill_requests ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can manage wallet refill requests"
ON public.wallet_refill_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_wallet_refill_requests_updated_at
BEFORE UPDATE ON public.wallet_refill_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for pending requests lookup
CREATE INDEX idx_wallet_refill_pending 
ON public.wallet_refill_requests (status, chain) 
WHERE status = 'PENDING';

-- Comments
COMMENT ON TABLE public.wallet_refill_requests IS 'Tracks pending and completed wallet refill tasks';
COMMENT ON COLUMN public.wallet_refill_requests.reason IS 'FEE_PAYER_LOW_BALANCE, OPS_LOW_BALANCE, etc.';
COMMENT ON COLUMN public.wallet_refill_requests.fulfilled_by_run_id IS 'Links to the arbitrage run that fulfilled this request';