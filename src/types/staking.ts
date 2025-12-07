import { TokenDefinition } from './database';

export interface StakingPoolType {
  id: string;
  token_definition_id: string;
  pool_name: string;
  apy_percentage: number;
  min_stake_amount: number;
  lock_period_days: number;
  total_staked: number;
  is_active: boolean;
  created_at: string;
  token_definition?: Pick<TokenDefinition, 'id' | 'token_name' | 'token_symbol' | 'contract_address' | 'deployment_status'>;
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

export interface FeeDiscountTier {
  id: string;
  token_definition_id: string;
  tier_name: string;
  min_balance: number;
  discount_percentage: number;
  created_at: string;
}
