-- Insert Aave V3 Sepolia flash loan provider for testnet flash loan testing
INSERT INTO public.flash_loan_providers (
  name,
  display_name,
  chain,
  contract_address,
  pool_address,
  fee_bps,
  supported_tokens,
  is_active,
  max_loan_amount_native
)
SELECT 
  'AAVE_V3_SEPOLIA',
  'Aave V3 (Sepolia Testnet)',
  'SEPOLIA',
  '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
  '0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A',
  5,
  ARRAY['USDC', 'DAI', 'WETH'],
  true,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM public.flash_loan_providers WHERE name = 'AAVE_V3_SEPOLIA'
);