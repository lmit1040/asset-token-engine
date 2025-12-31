export interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  uses_count: number;
  is_active: boolean;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code_id: string | null;
  onboarding_completed: boolean;
  reward_distributed: boolean;
  reward_amount: number;
  created_at: string;
}

export interface ActivityReward {
  id: string;
  user_id: string;
  reward_type: RewardType;
  action_type: string;
  entity_id: string | null;
  mxg_amount: number;
  status: 'pending' | 'claimed' | 'distributed';
  distributed_at: string | null;
  created_at: string;
}

export interface RewardConfiguration {
  id: string;
  reward_type: RewardType;
  mxg_amount: number;
  description: string | null;
  is_active: boolean;
  max_per_user_daily: number | null;
  updated_at: string;
}

export type RewardType = 
  | 'asset_submission'
  | 'profile_complete'
  | 'governance_vote'
  | 'referral_signup'
  | 'referral_onboarding'
  | 'staking';

export interface StakingPool {
  id: string;
  token_definition_id: string;
  pool_name: string;
  apy_percentage: number;
  min_stake_amount: number;
  lock_period_days: number;
  total_staked: number;
  is_active: boolean;
  created_at: string;
}

export interface UserStake {
  id: string;
  user_id: string;
  staking_pool_id: string;
  staked_amount: number;
  rewards_earned: number;
  last_reward_calculation: string;
  staked_at: string;
  unlock_at: string | null;
  is_active: boolean;
}

export interface RewardsSummary {
  totalEarned: number;
  pendingRewards: number;
  claimedRewards: number;
  stakingRewards: number;
  referralRewards: number;
  activityRewards: number;
}
