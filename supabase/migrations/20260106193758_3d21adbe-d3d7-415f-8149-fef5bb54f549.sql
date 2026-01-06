-- Create enterprise_accounts table
CREATE TABLE public.enterprise_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_name TEXT NOT NULL,
  contract_reference TEXT NOT NULL,
  annual_fee_cents INTEGER NOT NULL,
  billing_contact_name TEXT,
  billing_contact_email TEXT,
  contract_start_date DATE NOT NULL,
  contract_end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  api_access_enabled BOOLEAN NOT NULL DEFAULT false,
  white_label_enabled BOOLEAN NOT NULL DEFAULT false,
  custom_asset_classes TEXT[],
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create enterprise_invoices table
CREATE TABLE public.enterprise_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_account_id UUID NOT NULL REFERENCES public.enterprise_accounts(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'paid_external', 'overdue', 'cancelled')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create enterprise_users junction table to link users to enterprise accounts
CREATE TABLE public.enterprise_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_account_id UUID NOT NULL REFERENCES public.enterprise_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES auth.users(id),
  UNIQUE(enterprise_account_id, user_id)
);

-- Enable RLS
ALTER TABLE public.enterprise_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_users ENABLE ROW LEVEL SECURITY;

-- Enterprise accounts: only admins can manage
CREATE POLICY "Admins can manage enterprise accounts"
ON public.enterprise_accounts
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enterprise users can view their account"
ON public.enterprise_accounts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.enterprise_users 
    WHERE enterprise_account_id = enterprise_accounts.id 
    AND user_id = auth.uid()
  )
);

-- Enterprise invoices: admins and account members can view
CREATE POLICY "Admins can manage enterprise invoices"
ON public.enterprise_invoices
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enterprise users can view invoices"
ON public.enterprise_invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.enterprise_users eu
    JOIN public.enterprise_accounts ea ON ea.id = eu.enterprise_account_id
    WHERE ea.id = enterprise_invoices.enterprise_account_id
    AND eu.user_id = auth.uid()
  )
);

-- Enterprise users: admins can manage, users can view their own
CREATE POLICY "Admins can manage enterprise users"
ON public.enterprise_users
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own enterprise membership"
ON public.enterprise_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Add trigger for updated_at
CREATE TRIGGER update_enterprise_accounts_updated_at
BEFORE UPDATE ON public.enterprise_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();