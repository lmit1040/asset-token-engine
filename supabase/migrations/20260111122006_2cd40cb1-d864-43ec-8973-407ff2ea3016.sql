-- Drop the overly permissive policy that allows public access
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limit_tracking;

-- Create admin-only policy for viewing rate limit data
CREATE POLICY "Admins can view rate limit tracking"
ON public.rate_limit_tracking
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Create admin-only policy for managing rate limit data
CREATE POLICY "Admins can manage rate limit tracking"
ON public.rate_limit_tracking
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));