-- Add discount tracking columns to payments table
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_tier TEXT,
ADD COLUMN IF NOT EXISTS original_amount_cents INTEGER;