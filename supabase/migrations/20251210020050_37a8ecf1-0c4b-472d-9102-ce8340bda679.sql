-- Create wallet_balance_snapshots table for wallet health monitoring

CREATE TABLE public.wallet_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_type text NOT NULL,
  wallet_address text NOT NULL,
  chain text NOT NULL,
  balance_native bigint NOT NULL,
  captured_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wallet_balance_snapshots ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view wallet balance snapshots"
ON public.wallet_balance_snapshots
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert wallet balance snapshots"
ON public.wallet_balance_snapshots
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Index for efficient time-series queries
CREATE INDEX idx_wallet_snapshots_address_time 
ON public.wallet_balance_snapshots (wallet_address, captured_at DESC);

CREATE INDEX idx_wallet_snapshots_type_chain 
ON public.wallet_balance_snapshots (wallet_type, chain);

-- Add comments
COMMENT ON TABLE public.wallet_balance_snapshots IS 'Historical balance snapshots for OPS and fee payer wallets';
COMMENT ON COLUMN public.wallet_balance_snapshots.wallet_type IS 'Wallet category: SOLANA_OPS, SOLANA_FEE_PAYER, EVM_OPS, TREASURY, etc.';
COMMENT ON COLUMN public.wallet_balance_snapshots.balance_native IS 'Balance in native token base units (lamports, wei, etc.)';