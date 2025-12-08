-- Create submission_status enum
CREATE TYPE public.submission_status AS ENUM (
  'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'
);

-- Create user_asset_submissions table
CREATE TABLE public.user_asset_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  submitted_by_role TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_quantity NUMERIC,
  unit TEXT,
  location_description TEXT,
  documents JSONB,
  status public.submission_status NOT NULL DEFAULT 'PENDING',
  admin_notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_asset_id UUID REFERENCES public.assets(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_asset_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_asset_submissions

-- Users can insert their own submissions
CREATE POLICY "Users can insert submissions"
ON public.user_asset_submissions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can view their own submissions
CREATE POLICY "Users can view own submissions"
ON public.user_asset_submissions FOR SELECT
USING (auth.uid() = user_id);

-- Asset managers can view all submissions
CREATE POLICY "Asset managers can view all submissions"
ON public.user_asset_submissions FOR SELECT
USING (public.has_role(auth.uid(), 'asset_manager'::app_role));

-- Admins have full access
CREATE POLICY "Admins can manage all submissions"
ON public.user_asset_submissions FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Users can update their pending submissions
CREATE POLICY "Users can update pending submissions"
ON public.user_asset_submissions FOR UPDATE
USING (auth.uid() = user_id AND status = 'PENDING'::public.submission_status)
WITH CHECK (auth.uid() = user_id AND status = 'PENDING'::public.submission_status);

-- Asset managers can update submissions for review
CREATE POLICY "Asset managers can review submissions"
ON public.user_asset_submissions FOR UPDATE
USING (
  public.has_role(auth.uid(), 'asset_manager'::app_role) 
  AND status IN ('PENDING'::public.submission_status, 'UNDER_REVIEW'::public.submission_status)
);

-- Create trigger for updated_at
CREATE TRIGGER update_user_asset_submissions_updated_at
BEFORE UPDATE ON public.user_asset_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();