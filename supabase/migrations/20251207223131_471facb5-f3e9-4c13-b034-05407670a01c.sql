-- Create staking_pools table for platform tokens like MXU
CREATE TABLE public.staking_pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_definition_id UUID NOT NULL REFERENCES public.token_definitions(id),
  pool_name TEXT NOT NULL,
  apy_percentage NUMERIC NOT NULL DEFAULT 5.0,
  min_stake_amount NUMERIC NOT NULL DEFAULT 0,
  lock_period_days INTEGER NOT NULL DEFAULT 0,
  total_staked NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_stakes table for tracking individual stakes
CREATE TABLE public.user_stakes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  staking_pool_id UUID NOT NULL REFERENCES public.staking_pools(id),
  staked_amount NUMERIC NOT NULL DEFAULT 0,
  rewards_earned NUMERIC NOT NULL DEFAULT 0,
  last_reward_calculation TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  staked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unlock_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Create fee_discount_tiers table for MXU holder benefits
CREATE TABLE public.fee_discount_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_definition_id UUID NOT NULL REFERENCES public.token_definitions(id),
  tier_name TEXT NOT NULL,
  min_balance NUMERIC NOT NULL,
  discount_percentage NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.staking_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_discount_tiers ENABLE ROW LEVEL SECURITY;

-- Staking pools: everyone can view, admins can manage
CREATE POLICY "Anyone can view staking pools"
ON public.staking_pools FOR SELECT
USING (true);

CREATE POLICY "Admins can manage staking pools"
ON public.staking_pools FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- User stakes: users can view/manage their own, admins can view all
CREATE POLICY "Users can view their own stakes"
ON public.user_stakes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own stakes"
ON public.user_stakes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stakes"
ON public.user_stakes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all stakes"
ON public.user_stakes FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fee discount tiers: everyone can view, admins can manage
CREATE POLICY "Anyone can view fee discount tiers"
ON public.fee_discount_tiers FOR SELECT
USING (true);

CREATE POLICY "Admins can manage fee discount tiers"
ON public.fee_discount_tiers FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));