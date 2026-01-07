-- Add Stripe test mode columns to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS stripe_test_mode BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS stripe_test_mode_toggled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_test_mode_toggled_by UUID;