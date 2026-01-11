-- Create an audit log table for sensitive NDA signature access
CREATE TABLE IF NOT EXISTS public.nda_access_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    nda_signature_id UUID REFERENCES public.nda_signatures(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('view', 'insert')),
    ip_address TEXT,
    user_agent TEXT,
    accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.nda_access_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs (no public access)
CREATE POLICY "Admins can view NDA access audit logs"
ON public.nda_access_audit_log
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Only service role can insert audit logs (via trigger)
CREATE POLICY "Service role inserts audit logs"
ON public.nda_access_audit_log
FOR INSERT
WITH CHECK (false);

-- Create a function to log NDA signature access
CREATE OR REPLACE FUNCTION public.log_nda_signature_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.nda_access_audit_log (user_id, nda_signature_id, action_type)
    VALUES (auth.uid(), NEW.id, TG_OP::text);
    RETURN NEW;
END;
$$;

-- Create trigger for INSERT access logging
CREATE TRIGGER audit_nda_signature_insert
    AFTER INSERT ON public.nda_signatures
    FOR EACH ROW
    EXECUTE FUNCTION public.log_nda_signature_access();

-- Add index for efficient querying
CREATE INDEX idx_nda_access_audit_user_id ON public.nda_access_audit_log(user_id);
CREATE INDEX idx_nda_access_audit_accessed_at ON public.nda_access_audit_log(accessed_at);

-- Comment on table for documentation
COMMENT ON TABLE public.nda_access_audit_log IS 'Audit log for tracking access to sensitive NDA signature data';