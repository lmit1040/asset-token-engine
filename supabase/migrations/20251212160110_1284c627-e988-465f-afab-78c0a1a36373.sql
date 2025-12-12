-- Create table to store NDA signatures
CREATE TABLE public.nda_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  nda_version TEXT NOT NULL DEFAULT '1.0',
  signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  signature_hash TEXT NOT NULL,
  blockchain_tx_signature TEXT,
  blockchain_recorded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicate signatures per user per version
ALTER TABLE public.nda_signatures ADD CONSTRAINT unique_user_nda_version UNIQUE (user_id, nda_version);

-- Enable RLS
ALTER TABLE public.nda_signatures ENABLE ROW LEVEL SECURITY;

-- Users can view their own NDA signatures
CREATE POLICY "Users can view their own NDA signatures"
ON public.nda_signatures
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own NDA signature (during signup)
CREATE POLICY "Users can insert their own NDA signature"
ON public.nda_signatures
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all NDA signatures
CREATE POLICY "Admins can view all NDA signatures"
ON public.nda_signatures
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Admins can manage NDA signatures
CREATE POLICY "Admins can manage NDA signatures"
ON public.nda_signatures
FOR ALL
USING (has_role(auth.uid(), 'admin'));