-- Add wallet address columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN evm_wallet_address text,
ADD COLUMN solana_wallet_address text;

-- Add indexes for wallet address lookups
CREATE INDEX idx_profiles_evm_wallet ON public.profiles(evm_wallet_address) WHERE evm_wallet_address IS NOT NULL;
CREATE INDEX idx_profiles_solana_wallet ON public.profiles(solana_wallet_address) WHERE solana_wallet_address IS NOT NULL;