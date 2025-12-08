-- Create fee_payer_topups table for logging OPS_WALLET -> fee payer transfers
CREATE TABLE public.fee_payer_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_payer_public_key TEXT NOT NULL,
  amount_lamports BIGINT NOT NULL,
  tx_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX idx_fee_payer_topups_created_at ON public.fee_payer_topups(created_at DESC);
CREATE INDEX idx_fee_payer_topups_fee_payer ON public.fee_payer_topups(fee_payer_public_key);

-- Enable RLS
ALTER TABLE public.fee_payer_topups ENABLE ROW LEVEL SECURITY;

-- RLS policies (admin-only)
CREATE POLICY "Admins can manage fee payer topups"
ON public.fee_payer_topups
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));