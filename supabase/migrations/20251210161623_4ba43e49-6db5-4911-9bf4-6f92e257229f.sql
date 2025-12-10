-- Add submitted_by column to assets table to track original submitters
ALTER TABLE public.assets ADD COLUMN submitted_by UUID REFERENCES auth.users(id);

-- Create token_definition_proposals table for user-proposed token definitions
CREATE TABLE public.token_definition_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
  proposed_by UUID NOT NULL,
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_model public.token_model NOT NULL DEFAULT 'ONE_TO_ONE',
  decimals INTEGER NOT NULL DEFAULT 0,
  total_supply NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on token_definition_proposals
ALTER TABLE public.token_definition_proposals ENABLE ROW LEVEL SECURITY;

-- Users can view their own proposals
CREATE POLICY "Users can view their own proposals"
ON public.token_definition_proposals
FOR SELECT
USING (auth.uid() = proposed_by);

-- Users can insert proposals for assets they submitted
CREATE POLICY "Submitters can propose token definitions"
ON public.token_definition_proposals
FOR INSERT
WITH CHECK (
  auth.uid() = proposed_by AND
  EXISTS (
    SELECT 1 FROM public.assets 
    WHERE assets.id = token_definition_proposals.asset_id 
    AND assets.submitted_by = auth.uid()
  )
);

-- Users can update their own PENDING proposals
CREATE POLICY "Users can update their pending proposals"
ON public.token_definition_proposals
FOR UPDATE
USING (auth.uid() = proposed_by AND status = 'PENDING')
WITH CHECK (auth.uid() = proposed_by AND status = 'PENDING');

-- Users can delete their own PENDING proposals
CREATE POLICY "Users can delete their pending proposals"
ON public.token_definition_proposals
FOR DELETE
USING (auth.uid() = proposed_by AND status = 'PENDING');

-- Admins can manage all proposals
CREATE POLICY "Admins can manage all proposals"
ON public.token_definition_proposals
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Asset managers can view all proposals
CREATE POLICY "Asset managers can view all proposals"
ON public.token_definition_proposals
FOR SELECT
USING (has_role(auth.uid(), 'asset_manager'));

-- Allow submitters to upload proof files for their assets
CREATE POLICY "Submitters can upload proof files for their assets"
ON public.proof_of_reserve_files
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assets 
    WHERE assets.id = proof_of_reserve_files.asset_id 
    AND assets.submitted_by = auth.uid()
  )
);

-- Trigger for updated_at on token_definition_proposals
CREATE TRIGGER update_token_definition_proposals_updated_at
BEFORE UPDATE ON public.token_definition_proposals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();