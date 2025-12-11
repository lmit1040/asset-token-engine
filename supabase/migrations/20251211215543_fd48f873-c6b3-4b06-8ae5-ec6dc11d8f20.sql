-- Add receiver_contract_address to flash_loan_providers table
-- This stores the deployed FlashLoanReceiver contract address per provider/chain
ALTER TABLE public.flash_loan_providers 
ADD COLUMN receiver_contract_address TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.flash_loan_providers.receiver_contract_address IS 'Deployed MetallumFlashReceiver contract address for atomic flash loan execution';