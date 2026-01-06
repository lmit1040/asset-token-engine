-- Create pricing_tiers table
CREATE TABLE public.pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  annual_fee_cents integer,
  created_at timestamptz DEFAULT now()
);

-- Seed pricing tiers data FIRST before adding FK
INSERT INTO public.pricing_tiers (tier_key, display_name, description, annual_fee_cents) VALUES
('RETAIL', 'Individual / Retail', 'Perfect for individual investors looking to tokenize personal precious metal holdings.', 0),
('TRUST', 'Trust / LLC / Family Office', 'Designed for trusts, LLCs, and family offices managing diversified metal portfolios.', 100000),
('ENTERPRISE', 'Enterprise / Institutional', 'Full-service solution for institutions requiring custom contracts and dedicated support.', NULL);

-- Enable RLS
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

-- RLS: Authenticated users can view pricing tiers
CREATE POLICY "Authenticated users can view pricing tiers"
ON public.pricing_tiers FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS: Only admins can insert pricing tiers
CREATE POLICY "Admins can insert pricing tiers"
ON public.pricing_tiers FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Only admins can update pricing tiers
CREATE POLICY "Admins can update pricing tiers"
ON public.pricing_tiers FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add pricing_tier column to profiles with default
ALTER TABLE public.profiles 
ADD COLUMN pricing_tier text DEFAULT 'RETAIL' REFERENCES public.pricing_tiers(tier_key);