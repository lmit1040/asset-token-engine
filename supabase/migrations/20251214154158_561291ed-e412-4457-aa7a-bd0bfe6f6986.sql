-- Add verification tracking fields to flash_loan_providers
ALTER TABLE flash_loan_providers 
ADD COLUMN is_verified boolean DEFAULT false,
ADD COLUMN verified_at timestamp with time zone DEFAULT null;