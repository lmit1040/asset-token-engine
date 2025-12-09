-- 1. Tighten profiles RLS - remove redundant policies, ensure strict user-only access
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Admins need to view profiles for user management
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Users can ONLY view their own profile
CREATE POLICY "Users can view own profile only"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- 2. Tighten assets RLS - restrict anonymous/public viewing
DROP POLICY IF EXISTS "Authenticated users can view assets" ON public.assets;

-- Only authenticated users can view non-archived assets
CREATE POLICY "Authenticated users can view active assets"
ON public.assets FOR SELECT
USING (auth.uid() IS NOT NULL AND archived_at IS NULL);

-- 3. Tighten attestations - public can only see ATTESTED status, not internal details
DROP POLICY IF EXISTS "Anyone can view attestations" ON public.attestations;

-- Public can view only verified attestations (for proof-of-reserve page)
CREATE POLICY "Public can view verified attestations"
ON public.attestations FOR SELECT
USING (status = 'ATTESTED');

-- Admins see all attestations
CREATE POLICY "Admins can view all attestations"
ON public.attestations FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- 4. Tighten token_definitions - only authenticated can view
DROP POLICY IF EXISTS "Authenticated users can view token definitions" ON public.token_definitions;

-- Only authenticated users can view active token definitions
CREATE POLICY "Authenticated users can view active tokens"
ON public.token_definitions FOR SELECT
USING (auth.uid() IS NOT NULL AND archived_at IS NULL);

-- 5. Tighten proof_of_reserve_files - restrict to verified files only for public
DROP POLICY IF EXISTS "Authenticated users can view proof files" ON public.proof_of_reserve_files;

-- Only show proof files linked to verified attestations (via join logic in edge function)
-- For now, require authentication to view any proof files
CREATE POLICY "Authenticated users can view proof files"
ON public.proof_of_reserve_files FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 6. Lock down marketplace tables (legacy) - disable if not in use
-- marketplace_orders: Only admins can interact
DROP POLICY IF EXISTS "Anyone can view open orders" ON public.marketplace_orders;
DROP POLICY IF EXISTS "Users can create their own orders" ON public.marketplace_orders;
DROP POLICY IF EXISTS "Users can update their own orders" ON public.marketplace_orders;

CREATE POLICY "Marketplace disabled - admin only"
ON public.marketplace_orders FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- marketplace_trades: Only admins can view (historical data)
DROP POLICY IF EXISTS "Users can view their own trades" ON public.marketplace_trades;

CREATE POLICY "Admin only access to trade history"
ON public.marketplace_trades FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- 7. Ensure staking_pools are view-only for non-admins (no yield features)
-- Already has "Anyone can view" which is fine for MXU Benefits display

-- 8. Add audit logging for sensitive operations (create function)
CREATE OR REPLACE FUNCTION public.log_sensitive_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_logs (action_type, entity_type, entity_id, performed_by, details)
  VALUES (
    TG_ARGV[0],
    TG_TABLE_NAME,
    NEW.id,
    auth.uid(),
    jsonb_build_object('operation', TG_OP, 'timestamp', now())
  );
  RETURN NEW;
END;
$$;