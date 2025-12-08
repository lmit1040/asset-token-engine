-- Create attestation status enum
CREATE TYPE attestation_status AS ENUM ('PENDING', 'ATTESTED', 'REJECTED');

-- Create attestations table for formal proof-of-reserve attestations
CREATE TABLE public.attestations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  attested_by UUID REFERENCES auth.users(id),
  attestation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status attestation_status NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  verification_hash TEXT,
  proof_file_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create P2P transfer request status enum
CREATE TYPE transfer_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- Create P2P transfer requests table (no pricing, just token quantity)
CREATE TABLE public.transfer_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_definition_id UUID NOT NULL REFERENCES public.token_definitions(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status transfer_request_status NOT NULL DEFAULT 'PENDING',
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

-- RLS for attestations: Admins can manage, anyone can view
CREATE POLICY "Admins can manage attestations" ON public.attestations
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view attestations" ON public.attestations
  FOR SELECT USING (true);

-- RLS for transfer_requests: Users can see their own, admins can see all
CREATE POLICY "Users can view their own transfer requests" ON public.transfer_requests
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Admins can view all transfer requests" ON public.transfer_requests
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create transfer requests from themselves" ON public.transfer_requests
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Recipient can update pending requests" ON public.transfer_requests
  FOR UPDATE USING (auth.uid() = to_user_id AND status = 'PENDING');

CREATE POLICY "Sender can cancel pending requests" ON public.transfer_requests
  FOR UPDATE USING (auth.uid() = from_user_id AND status = 'PENDING');

-- Indexes for performance
CREATE INDEX idx_attestations_asset_id ON public.attestations(asset_id);
CREATE INDEX idx_attestations_status ON public.attestations(status);
CREATE INDEX idx_transfer_requests_from_user ON public.transfer_requests(from_user_id);
CREATE INDEX idx_transfer_requests_to_user ON public.transfer_requests(to_user_id);
CREATE INDEX idx_transfer_requests_status ON public.transfer_requests(status);

-- Trigger for updated_at
CREATE TRIGGER update_attestations_updated_at
  BEFORE UPDATE ON public.attestations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transfer_requests_updated_at
  BEFORE UPDATE ON public.transfer_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();