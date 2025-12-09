-- Create EVM fee payer keys table for multi-chain management
CREATE TABLE public.evm_fee_payer_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key text NOT NULL,
  label text NOT NULL,
  network text NOT NULL DEFAULT 'POLYGON',
  is_active boolean NOT NULL DEFAULT true,
  is_generated boolean NOT NULL DEFAULT false,
  secret_key_encrypted text,
  balance_native numeric DEFAULT 0,
  last_used_at timestamp with time zone,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valid_evm_network CHECK (network IN ('POLYGON', 'ETHEREUM', 'ARBITRUM', 'BSC'))
);

-- Create EVM fee payer top-ups table
CREATE TABLE public.evm_fee_payer_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_payer_public_key text NOT NULL,
  network text NOT NULL,
  amount_wei text NOT NULL,
  tx_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valid_topup_network CHECK (network IN ('POLYGON', 'ETHEREUM', 'ARBITRUM', 'BSC'))
);

-- Enable RLS
ALTER TABLE public.evm_fee_payer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evm_fee_payer_topups ENABLE ROW LEVEL SECURITY;

-- RLS policies for evm_fee_payer_keys (admin only)
CREATE POLICY "Admins can manage EVM fee payer keys"
  ON public.evm_fee_payer_keys
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view EVM fee payer keys"
  ON public.evm_fee_payer_keys
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- RLS policies for evm_fee_payer_topups (admin only)
CREATE POLICY "Admins can manage EVM fee payer topups"
  ON public.evm_fee_payer_topups
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Create index for network filtering
CREATE INDEX idx_evm_fee_payer_keys_network ON public.evm_fee_payer_keys(network);
CREATE INDEX idx_evm_fee_payer_keys_active ON public.evm_fee_payer_keys(is_active);
CREATE INDEX idx_evm_fee_payer_topups_network ON public.evm_fee_payer_topups(network);