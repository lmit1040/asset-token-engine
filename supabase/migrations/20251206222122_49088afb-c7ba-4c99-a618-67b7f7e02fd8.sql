-- Add treasury_account column to token_definitions table
ALTER TABLE public.token_definitions
ADD COLUMN treasury_account text;