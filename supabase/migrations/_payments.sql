-- 1) Payment status enum
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','refunded','canceled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2) Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  purpose text NOT NULL,                 -- e.g. ASSET_SUBMISSION, TOKEN_IMPORT, MEMBERSHIP, TRUST_INVOICE
  related_table text NULL,               -- e.g. assets / token_definitions / trust_invoices
  related_id uuid NULL,

  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',

  stripe_customer_id text NULL,
  stripe_checkout_session_id text UNIQUE NULL,
  stripe_payment_intent_id text UNIQUE NULL,

  status public.payment_status NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- User can view their own payments
CREATE POLICY "Users can view own payments"
ON public.payments
FOR SELECT
USING (auth.uid() = user_id);

-- Only service role / edge functions should insert/update payments
-- (Do not grant insert/update to authenticated users)
