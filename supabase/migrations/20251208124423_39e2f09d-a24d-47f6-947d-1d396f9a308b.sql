-- Phase 1: Seed production-ready assets for precious metals
INSERT INTO public.assets (id, asset_type, name, quantity, unit, storage_location, owner_entity, description)
VALUES 
  ('a1b2c3d4-1111-4000-8000-000000000001', 'GOLDBACK', 'Goldback Inventory', 1000, 'GOLDBACK', 'Primary Vault - Section A', 'SPV_LLC', 'Premium Goldback notes in denominations of 1, 5, 10, 25, and 50. Verified and authenticated.'),
  ('a1b2c3d4-2222-4000-8000-000000000002', 'SILVER', 'Silver Reserve', 500, 'OZ', 'Primary Vault - Section B', 'BUSINESS_TRUST', 'Pure .999 fine silver bars and rounds. Assayed and certified.'),
  ('a1b2c3d4-3333-4000-8000-000000000003', 'COPPER', 'Copper Reserve', 100, 'LB', 'Primary Vault - Section C', 'PERSONAL_TRUST', 'High-grade copper bullion bars. Industrial quality certified.'),
  ('a1b2c3d4-4444-4000-8000-000000000004', 'GOLD_CERTIFICATE', 'Historic Gold Certificate Collection', 1, 'CERTIFICATE', 'Secure Display Case', 'SPV_LLC', 'Rare 1928 Series Gold Certificate. Museum-quality preservation.')
ON CONFLICT (id) DO NOTHING;

-- Create token definitions for each asset (configured for Solana Devnet, ready to deploy)
INSERT INTO public.token_definitions (id, asset_id, token_name, token_symbol, token_model, decimals, total_supply, chain, network, deployment_status, notes)
VALUES 
  ('11b2c3d4-1111-4000-8000-000000000001', 'a1b2c3d4-1111-4000-8000-000000000001', 'Goldback Token', 'GBX', 'ONE_TO_ONE', 0, 1000, 'SOLANA', 'TESTNET', 'NOT_DEPLOYED', 'Each GBX token represents 1 physical Goldback note in vault custody.'),
  ('22b2c3d4-2222-4000-8000-000000000002', 'a1b2c3d4-2222-4000-8000-000000000002', 'MetallumX Silver', 'MXS', 'FRACTIONAL', 6, 500000000, 'SOLANA', 'TESTNET', 'NOT_DEPLOYED', 'Fractional silver token. 1 MXS = 0.000001 oz silver. Total represents 500 oz.'),
  ('33b2c3d4-3333-4000-8000-000000000003', 'a1b2c3d4-3333-4000-8000-000000000003', 'MetallumX Copper', 'MXC', 'FRACTIONAL', 4, 1000000, 'SOLANA', 'TESTNET', 'NOT_DEPLOYED', 'Fractional copper token. 1 MXC = 0.0001 lb copper. Total represents 100 lbs.'),
  ('44b2c3d4-4444-4000-8000-000000000004', 'a1b2c3d4-4444-4000-8000-000000000004', 'Gold Certificate Token', 'GCX', 'ONE_TO_ONE', 0, 1, 'SOLANA', 'TESTNET', 'NOT_DEPLOYED', 'Single token representing ownership of the historic 1928 Gold Certificate.')
ON CONFLICT (id) DO NOTHING;

-- Phase 2: Fee Payer Rotation System
CREATE TABLE IF NOT EXISTS public.fee_payer_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  public_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  balance_sol NUMERIC DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fee_payer_keys ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage fee payer keys
CREATE POLICY "Admins can view fee payer keys"
  ON public.fee_payer_keys
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage fee payer keys"
  ON public.fee_payer_keys
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_fee_payer_keys_active ON public.fee_payer_keys (is_active, last_used_at);