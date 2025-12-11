-- Phase 1: Flash Loan Database Schema

-- 1.1 Add flash loan fields to arbitrage_strategies table
ALTER TABLE arbitrage_strategies 
  ADD COLUMN IF NOT EXISTS use_flash_loan BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS flash_loan_provider TEXT,
  ADD COLUMN IF NOT EXISTS flash_loan_token TEXT,
  ADD COLUMN IF NOT EXISTS flash_loan_amount_native BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flash_loan_fee_bps INTEGER DEFAULT 9;

-- 1.2 Add flash loan tracking to arbitrage_runs table
ALTER TABLE arbitrage_runs 
  ADD COLUMN IF NOT EXISTS used_flash_loan BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS flash_loan_provider TEXT,
  ADD COLUMN IF NOT EXISTS flash_loan_amount TEXT,
  ADD COLUMN IF NOT EXISTS flash_loan_fee TEXT;

-- 1.3 Create flash loan providers configuration table
CREATE TABLE IF NOT EXISTS public.flash_loan_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  chain TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  pool_address TEXT,
  fee_bps INTEGER NOT NULL DEFAULT 9,
  max_loan_amount_native BIGINT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  supported_tokens TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS to flash_loan_providers
ALTER TABLE public.flash_loan_providers ENABLE ROW LEVEL SECURITY;

-- Admin-only access for flash loan providers
CREATE POLICY "Admins can manage flash loan providers"
  ON public.flash_loan_providers
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 1.4 Add flash loan settings to system_settings
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS max_flash_loan_amount_native BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flash_loan_profit_threshold_bps INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS flash_loan_cooldown_seconds INTEGER DEFAULT 60;

-- 1.5 Seed default flash loan providers
INSERT INTO public.flash_loan_providers (name, display_name, chain, contract_address, pool_address, fee_bps, is_active, supported_tokens) VALUES
  -- EVM Providers (Aave V3)
  ('AAVE_V3_POLYGON', 'Aave V3 (Polygon)', 'POLYGON', '0x794a61358D6845594F94dc1DB02A252b5b4814aD', '0x794a61358D6845594F94dc1DB02A252b5b4814aD', 5, true, ARRAY['USDC', 'USDT', 'DAI', 'WETH', 'WMATIC']),
  ('AAVE_V3_ETHEREUM', 'Aave V3 (Ethereum)', 'ETHEREUM', '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', 5, true, ARRAY['USDC', 'USDT', 'DAI', 'WETH']),
  ('AAVE_V3_ARBITRUM', 'Aave V3 (Arbitrum)', 'ARBITRUM', '0x794a61358D6845594F94dc1DB02A252b5b4814aD', '0x794a61358D6845594F94dc1DB02A252b5b4814aD', 5, true, ARRAY['USDC', 'USDT', 'DAI', 'WETH']),
  -- Balancer (0% fee flash loans)
  ('BALANCER_POLYGON', 'Balancer (Polygon)', 'POLYGON', '0xBA12222222228d8Ba445958a75a0704d566BF2C8', '0xBA12222222228d8Ba445958a75a0704d566BF2C8', 0, true, ARRAY['USDC', 'USDT', 'DAI', 'WETH', 'WMATIC']),
  ('BALANCER_ETHEREUM', 'Balancer (Ethereum)', 'ETHEREUM', '0xBA12222222228d8Ba445958a75a0704d566BF2C8', '0xBA12222222228d8Ba445958a75a0704d566BF2C8', 0, true, ARRAY['USDC', 'USDT', 'DAI', 'WETH']),
  -- Solana Providers
  ('SOLEND_MAIN', 'Solend (Solana)', 'SOLANA', 'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo', 'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo', 30, false, ARRAY['SOL', 'USDC', 'USDT']),
  ('MARGINFI_MAIN', 'MarginFi (Solana)', 'SOLANA', 'MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA', 'MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA', 0, false, ARRAY['SOL', 'USDC', 'USDT'])
ON CONFLICT DO NOTHING;

-- Add updated_at trigger
CREATE TRIGGER update_flash_loan_providers_updated_at
  BEFORE UPDATE ON public.flash_loan_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();