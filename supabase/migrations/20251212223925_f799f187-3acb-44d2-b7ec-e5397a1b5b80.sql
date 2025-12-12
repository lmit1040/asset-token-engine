-- Drop the existing check constraint and recreate with testnet support
ALTER TABLE public.evm_fee_payer_keys DROP CONSTRAINT IF EXISTS valid_evm_network;

ALTER TABLE public.evm_fee_payer_keys ADD CONSTRAINT valid_evm_network 
CHECK (network IN ('POLYGON', 'ETHEREUM', 'ARBITRUM', 'BSC', 'SEPOLIA', 'POLYGON_AMOY', 'ARBITRUM_SEPOLIA', 'BSC_TESTNET'));