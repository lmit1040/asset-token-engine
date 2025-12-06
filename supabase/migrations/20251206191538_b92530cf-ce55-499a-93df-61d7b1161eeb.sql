-- Create enum for blockchain chains
CREATE TYPE public.blockchain_chain AS ENUM ('ETHEREUM', 'POLYGON', 'BSC', 'SOLANA', 'NONE');

-- Add Web3 fields to token_definitions
ALTER TABLE public.token_definitions 
ADD COLUMN chain public.blockchain_chain NOT NULL DEFAULT 'NONE',
ADD COLUMN contract_address text,
ADD COLUMN deployed boolean NOT NULL DEFAULT false;

-- Create activity_logs table
CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_name text,
  performed_by uuid REFERENCES auth.users(id),
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view activity logs
CREATE POLICY "Admins can view activity logs"
ON public.activity_logs
FOR SELECT
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert activity logs
CREATE POLICY "Admins can insert activity logs"
ON public.activity_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_action_type ON public.activity_logs(action_type);