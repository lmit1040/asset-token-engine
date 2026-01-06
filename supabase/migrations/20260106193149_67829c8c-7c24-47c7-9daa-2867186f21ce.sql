-- Create fee_catalog table
CREATE TABLE public.fee_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fee_key TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL REFERENCES public.pricing_tiers(tier_key),
  description TEXT,
  amount_cents INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fee_catalog ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view fees
CREATE POLICY "Authenticated users can view fees"
ON public.fee_catalog
FOR SELECT
TO authenticated
USING (true);

-- Only admins can manage fees
CREATE POLICY "Admins can manage fees"
ON public.fee_catalog
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Seed retail tier fees
INSERT INTO public.fee_catalog (fee_key, tier, description, amount_cents) VALUES
  ('ASSET_SUBMISSION_RETAIL', 'RETAIL', 'Asset submission processing fee', 5000),
  ('ATTESTATION_RETAIL', 'RETAIL', 'Proof-of-reserve attestation fee', 10000),
  ('TOKEN_DEPLOY_RETAIL', 'RETAIL', 'Token deployment fee', 20000),
  ('REGISTRY_ANNUAL_RETAIL', 'RETAIL', 'Annual registry maintenance fee', 5000);