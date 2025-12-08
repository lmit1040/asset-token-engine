-- Add soft-delete columns to assets table
ALTER TABLE public.assets 
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN archived_by UUID DEFAULT NULL;

-- Add soft-delete columns to token_definitions table
ALTER TABLE public.token_definitions 
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN archived_by UUID DEFAULT NULL;

-- Create index for efficient filtering of non-archived records
CREATE INDEX idx_assets_archived_at ON public.assets(archived_at) WHERE archived_at IS NULL;
CREATE INDEX idx_token_definitions_archived_at ON public.token_definitions(archived_at) WHERE archived_at IS NULL;