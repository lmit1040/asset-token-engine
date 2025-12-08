
-- Create enums for governance
CREATE TYPE public.proposal_type AS ENUM ('PARAMETER_CHANGE', 'TOKEN_ADDITION', 'FEE_ADJUSTMENT', 'GENERAL');
CREATE TYPE public.proposal_status AS ENUM ('DRAFT', 'ACTIVE', 'PASSED', 'REJECTED', 'EXECUTED', 'CANCELLED');
CREATE TYPE public.vote_choice AS ENUM ('FOR', 'AGAINST', 'ABSTAIN');

-- Create governance_proposals table
CREATE TABLE public.governance_proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  proposal_type proposal_type NOT NULL DEFAULT 'GENERAL',
  status proposal_status NOT NULL DEFAULT 'DRAFT',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  voting_starts_at TIMESTAMP WITH TIME ZONE,
  voting_ends_at TIMESTAMP WITH TIME ZONE,
  quorum_percentage NUMERIC NOT NULL DEFAULT 10,
  pass_threshold_percentage NUMERIC NOT NULL DEFAULT 50,
  execution_data JSONB,
  votes_for NUMERIC NOT NULL DEFAULT 0,
  votes_against NUMERIC NOT NULL DEFAULT 0,
  votes_abstain NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create proposal_votes table
CREATE TABLE public.proposal_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.governance_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote vote_choice NOT NULL,
  voting_power NUMERIC NOT NULL DEFAULT 0,
  voted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, user_id)
);

-- Enable RLS
ALTER TABLE public.governance_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_votes ENABLE ROW LEVEL SECURITY;

-- RLS policies for governance_proposals
CREATE POLICY "Anyone can view proposals"
ON public.governance_proposals
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create proposals"
ON public.governance_proposals
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage proposals"
ON public.governance_proposals
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Creators can update their draft proposals"
ON public.governance_proposals
FOR UPDATE
USING (auth.uid() = created_by AND status = 'DRAFT');

-- RLS policies for proposal_votes
CREATE POLICY "Anyone can view votes"
ON public.proposal_votes
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can vote"
ON public.proposal_votes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own votes"
ON public.proposal_votes
FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_governance_proposals_updated_at
BEFORE UPDATE ON public.governance_proposals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
