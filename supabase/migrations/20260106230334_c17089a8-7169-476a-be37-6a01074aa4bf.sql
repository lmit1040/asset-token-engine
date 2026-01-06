-- Phase 1: Extend fee_catalog table with new columns
ALTER TABLE public.fee_catalog 
ADD COLUMN IF NOT EXISTS fee_type TEXT CHECK (fee_type IN ('ONE_TIME', 'PER_TRANSACTION', 'PER_EXECUTION', 'MONTHLY', 'ANNUAL')),
ADD COLUMN IF NOT EXISTS applies_to TEXT CHECK (applies_to IN ('ASSET', 'TOKEN', 'ATTESTATION', 'REGISTRY', 'GOVERNANCE', 'OPS')),
ADD COLUMN IF NOT EXISTS intro_price BOOLEAN DEFAULT false;

-- Phase 2: Create fee_versions audit table
CREATE TABLE IF NOT EXISTS public.fee_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fee_key TEXT NOT NULL,
  old_amount_cents INTEGER NOT NULL,
  new_amount_cents INTEGER NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on fee_versions
ALTER TABLE public.fee_versions ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can read all fee versions
CREATE POLICY "Admins can read fee versions"
ON public.fee_versions
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Phase 3: Create trigger function to log fee changes
CREATE OR REPLACE FUNCTION public.log_fee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.amount_cents IS DISTINCT FROM NEW.amount_cents THEN
    INSERT INTO public.fee_versions (fee_key, old_amount_cents, new_amount_cents, changed_by, reason, effective_date)
    VALUES (NEW.fee_key, OLD.amount_cents, NEW.amount_cents, auth.uid(), 'Manual update', now());
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on fee_catalog for automatic versioning
DROP TRIGGER IF EXISTS trigger_log_fee_change ON public.fee_catalog;
CREATE TRIGGER trigger_log_fee_change
BEFORE UPDATE ON public.fee_catalog
FOR EACH ROW
EXECUTE FUNCTION public.log_fee_change();

-- Phase 4: Create fee key validation trigger function
CREATE OR REPLACE FUNCTION public.validate_fee_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.fee_key ~* '(yield|profit|return|interest|apy|spread)' THEN
    RAISE EXCEPTION 'Fee key cannot contain yield-related terminology';
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for fee key validation on insert/update
DROP TRIGGER IF EXISTS trigger_validate_fee_key ON public.fee_catalog;
CREATE TRIGGER trigger_validate_fee_key
BEFORE INSERT OR UPDATE ON public.fee_catalog
FOR EACH ROW
EXECUTE FUNCTION public.validate_fee_key();

-- Phase 5: Clear existing fee data and seed new fees
DELETE FROM public.fee_catalog;

-- RETAIL Tier Fees
INSERT INTO public.fee_catalog (fee_key, tier, description, amount_cents, fee_type, applies_to, enabled) VALUES
('ASSET_SUBMISSION_RETAIL', 'RETAIL', 'Asset submission and record creation', 10000, 'ONE_TIME', 'ASSET', true),
('ATTESTATION_RETAIL', 'RETAIL', 'Proof-of-reserve attestation', 20000, 'PER_EXECUTION', 'ATTESTATION', true),
('TOKEN_DEPLOY_RETAIL', 'RETAIL', 'Token deployment and metadata registration', 40000, 'ONE_TIME', 'TOKEN', true),
('REGISTRY_ANNUAL_RETAIL', 'RETAIL', 'Annual registry hosting and document availability', 12500, 'ANNUAL', 'REGISTRY', true),
('TRANSFER_RETAIL', 'RETAIL', 'P2P token transfer processing', 100, 'PER_TRANSACTION', 'TOKEN', true);

-- TRUST Tier Fees
INSERT INTO public.fee_catalog (fee_key, tier, description, amount_cents, fee_type, applies_to, enabled) VALUES
('ASSET_ONBOARDING_TRUST', 'TRUST', 'Trust asset onboarding bundle', 350000, 'ONE_TIME', 'ASSET', true),
('VAULT_BASKET_TOKEN_TRUST', 'TRUST', 'Multi-asset vault basket tokenization', 600000, 'ONE_TIME', 'TOKEN', true),
('BATCH_UPLOAD_TRUST', 'TRUST', 'Multi-asset batch ingestion and review', 150000, 'PER_EXECUTION', 'ASSET', true),
('ANNUAL_VERIFICATION_TRUST', 'TRUST', 'Annual verification, hosting, and audit trail', 250000, 'ANNUAL', 'REGISTRY', true),
('TRUST_MONTHLY_MAINTENANCE', 'TRUST', 'Ongoing registry maintenance and support', 25000, 'MONTHLY', 'REGISTRY', true);

-- ENTERPRISE Tier Fees (Invoice-Only Placeholders)
INSERT INTO public.fee_catalog (fee_key, tier, description, amount_cents, fee_type, applies_to, enabled) VALUES
('ENTERPRISE_PLATFORM_LICENSE', 'ENTERPRISE', 'Enterprise registry platform license', 2500000, 'ANNUAL', 'REGISTRY', true),
('ENTERPRISE_API_ACCESS', 'ENTERPRISE', 'API access, integrations, and attestations', 5000000, 'ANNUAL', 'OPS', true),
('CUSTOM_ASSET_MODULE', 'ENTERPRISE', 'Custom asset classes (insurance, structured)', 1500000, 'ONE_TIME', 'ASSET', true);