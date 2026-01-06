-- Add TRUST tier fees to fee_catalog
INSERT INTO public.fee_catalog (fee_key, tier, description, amount_cents) VALUES
  ('ASSET_ONBOARDING_TRUST', 'TRUST', 'Asset onboarding bundle (includes submission, review, and setup)', 150000),
  ('ANNUAL_VERIFICATION_TRUST', 'TRUST', 'Annual verification and hosting fee', 100000),
  ('VAULT_BASKET_TOKEN_TRUST', 'TRUST', 'Vault basket tokenization service', 250000),
  ('BATCH_UPLOAD_TRUST', 'TRUST', 'Multi-asset batch upload processing', 50000);

-- Create trust_accounts table
CREATE TABLE public.trust_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('Trust', 'LLC', 'SPV', 'Family Office')),
  ein_last_four TEXT,
  formation_state TEXT,
  formation_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  annual_renewal_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trust_invoices table for invoice history
CREATE TABLE public.trust_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trust_account_id UUID NOT NULL REFERENCES public.trust_accounts(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  stripe_invoice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trust_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_invoices ENABLE ROW LEVEL SECURITY;

-- Trust accounts: owners can view their own, admins can view all
CREATE POLICY "Users can view own trust accounts"
ON public.trust_accounts
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage trust accounts"
ON public.trust_accounts
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create trust accounts"
ON public.trust_accounts
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

-- Trust invoices: owners can view their own via trust account, admins can manage
CREATE POLICY "Users can view own trust invoices"
ON public.trust_invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trust_accounts 
    WHERE id = trust_invoices.trust_account_id 
    AND owner_user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can manage trust invoices"
ON public.trust_invoices
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_trust_accounts_updated_at
BEFORE UPDATE ON public.trust_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();