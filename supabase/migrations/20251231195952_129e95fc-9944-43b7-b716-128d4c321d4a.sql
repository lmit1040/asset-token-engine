-- Create referral_codes table
CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code TEXT UNIQUE NOT NULL,
  uses_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create referrals table
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL,
  referred_id UUID NOT NULL,
  referral_code_id UUID REFERENCES public.referral_codes(id),
  onboarding_completed BOOLEAN DEFAULT false,
  reward_distributed BOOLEAN DEFAULT false,
  reward_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create activity_rewards table
CREATE TABLE public.activity_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reward_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_id UUID,
  mxg_amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  distributed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create reward_configurations table
CREATE TABLE public.reward_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_type TEXT UNIQUE NOT NULL,
  mxg_amount NUMERIC NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  max_per_user_daily INTEGER,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_configurations ENABLE ROW LEVEL SECURITY;

-- RLS for referral_codes
CREATE POLICY "Users can view own referral codes" ON public.referral_codes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own referral codes" ON public.referral_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all referral codes" ON public.referral_codes
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can validate referral codes" ON public.referral_codes
  FOR SELECT USING (is_active = true);

-- RLS for referrals
CREATE POLICY "Users can view own referrals as referrer" ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id);

CREATE POLICY "Users can view own referrals as referred" ON public.referrals
  FOR SELECT USING (auth.uid() = referred_id);

CREATE POLICY "Admins can manage all referrals" ON public.referrals
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert referrals" ON public.referrals
  FOR INSERT WITH CHECK (auth.uid() = referred_id);

-- RLS for activity_rewards
CREATE POLICY "Users can view own activity rewards" ON public.activity_rewards
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all activity rewards" ON public.activity_rewards
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert activity rewards" ON public.activity_rewards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending rewards" ON public.activity_rewards
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');

-- RLS for reward_configurations
CREATE POLICY "Anyone can view active reward configs" ON public.reward_configurations
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage reward configs" ON public.reward_configurations
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Insert default reward configurations
INSERT INTO public.reward_configurations (reward_type, mxg_amount, description, max_per_user_daily) VALUES
  ('asset_submission', 10, 'Submit a new asset for tokenization', 5),
  ('profile_complete', 50, 'Complete your profile with all details', 1),
  ('governance_vote', 5, 'Vote on a governance proposal', NULL),
  ('referral_signup', 25, 'Referred user signs up', NULL),
  ('referral_onboarding', 100, 'Referred user completes onboarding', NULL);

-- Insert MXG staking pool (using the actual MXG token definition ID)
INSERT INTO public.staking_pools (token_definition_id, pool_name, apy_percentage, min_stake_amount, lock_period_days)
SELECT id, 'MXG Governance Staking', 8.0, 10, 30
FROM public.token_definitions
WHERE token_symbol = 'MXG'
LIMIT 1;