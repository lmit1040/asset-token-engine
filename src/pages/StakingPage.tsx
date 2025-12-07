import { useEffect, useState, useCallback } from 'react';
import { Coins, TrendingUp, Lock, Gift, Percent } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { StakingPool } from '@/components/staking/StakingPool';
import { FeeDiscountTiers } from '@/components/staking/FeeDiscountTiers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { StakingPoolType, UserStake, FeeDiscountTier } from '@/types/staking';

export default function StakingPage() {
  const { user } = useAuth();
  const [pools, setPools] = useState<StakingPoolType[]>([]);
  const [userStakes, setUserStakes] = useState<UserStake[]>([]);
  const [discountTiers, setDiscountTiers] = useState<FeeDiscountTier[]>([]);
  const [userMxuBalance, setUserMxuBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Fetch staking pools with token info
      const { data: poolsData, error: poolsError } = await supabase
        .from('staking_pools')
        .select(`
          *,
          token_definition:token_definitions (
            id, token_name, token_symbol, contract_address, deployment_status
          )
        `)
        .eq('is_active', true);

      if (poolsError) throw poolsError;
      setPools(poolsData || []);

      // Fetch user's stakes
      const { data: stakesData, error: stakesError } = await supabase
        .from('user_stakes')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (stakesError) throw stakesError;
      setUserStakes(stakesData || []);

      // Fetch fee discount tiers for MXU
      const { data: mxuToken } = await supabase
        .from('token_definitions')
        .select('id')
        .eq('token_symbol', 'MXU')
        .single();

      if (mxuToken) {
        const { data: tiersData } = await supabase
          .from('fee_discount_tiers')
          .select('*')
          .eq('token_definition_id', mxuToken.id)
          .order('min_balance', { ascending: true });

        setDiscountTiers(tiersData || []);

        // Fetch user's MXU balance
        const { data: holdingData } = await supabase
          .from('user_token_holdings')
          .select('balance')
          .eq('user_id', user.id)
          .eq('token_definition_id', mxuToken.id)
          .single();

        setUserMxuBalance(holdingData?.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching staking data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load staking data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStake = async (poolId: string, amount: number) => {
    if (!user) return;

    try {
      // Create stake record
      const { error: stakeError } = await supabase
        .from('user_stakes')
        .insert({
          user_id: user.id,
          staking_pool_id: poolId,
          staked_amount: amount,
        });

      if (stakeError) throw stakeError;

      // Update pool total staked
      const pool = pools.find(p => p.id === poolId);
      if (pool) {
        const { error: updateError } = await supabase
          .from('staking_pools')
          .update({ total_staked: pool.total_staked + amount })
          .eq('id', poolId);

        if (updateError) throw updateError;
      }

      toast({
        title: 'Staked Successfully',
        description: `You staked ${amount.toLocaleString()} tokens`,
      });

      fetchData();
    } catch (error) {
      console.error('Error staking:', error);
      toast({
        title: 'Staking Failed',
        description: 'Could not complete staking operation',
        variant: 'destructive',
      });
    }
  };

  const handleUnstake = async (stakeId: string) => {
    try {
      const stake = userStakes.find(s => s.id === stakeId);
      if (!stake) return;

      // Mark stake as inactive
      const { error: stakeError } = await supabase
        .from('user_stakes')
        .update({ is_active: false })
        .eq('id', stakeId);

      if (stakeError) throw stakeError;

      // Update pool total staked
      const pool = pools.find(p => p.id === stake.staking_pool_id);
      if (pool) {
        const { error: updateError } = await supabase
          .from('staking_pools')
          .update({ total_staked: Math.max(0, pool.total_staked - stake.staked_amount) })
          .eq('id', pool.id);

        if (updateError) throw updateError;
      }

      toast({
        title: 'Unstaked Successfully',
        description: `You unstaked ${stake.staked_amount.toLocaleString()} tokens`,
      });

      fetchData();
    } catch (error) {
      console.error('Error unstaking:', error);
      toast({
        title: 'Unstake Failed',
        description: 'Could not complete unstake operation',
        variant: 'destructive',
      });
    }
  };

  // Calculate user stats
  const totalStaked = userStakes.reduce((acc, s) => acc + s.staked_amount, 0);
  const totalRewards = userStakes.reduce((acc, s) => acc + s.rewards_earned, 0);
  
  // Find user's current discount tier
  const currentTier = discountTiers
    .filter(t => userMxuBalance >= t.min_balance)
    .sort((a, b) => b.min_balance - a.min_balance)[0];

  return (
    <DashboardLayout
      title="MXU Staking"
      subtitle="Stake MXU tokens to earn rewards and unlock fee discounts"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Your MXU Balance"
            value={userMxuBalance.toLocaleString()}
            subtitle="Available tokens"
            icon={<Coins className="h-6 w-6" />}
          />
          <StatCard
            title="Total Staked"
            value={totalStaked.toLocaleString()}
            subtitle="MXU in pools"
            icon={<Lock className="h-6 w-6" />}
          />
          <StatCard
            title="Rewards Earned"
            value={totalRewards.toFixed(2)}
            subtitle="MXU earned"
            icon={<Gift className="h-6 w-6" />}
          />
          <StatCard
            title="Fee Discount"
            value={currentTier ? `${currentTier.discount_percentage}%` : '0%'}
            subtitle={currentTier?.tier_name || 'No tier'}
            icon={<Percent className="h-6 w-6" />}
          />
        </div>

        {/* Staking Pools */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Staking Pools</h2>
              <p className="text-sm text-muted-foreground">
                Stake your tokens to earn rewards
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading pools...
            </div>
          ) : pools.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No staking pools available yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pools.map((pool) => {
                const userStake = userStakes.find(s => s.staking_pool_id === pool.id);
                return (
                  <StakingPool
                    key={pool.id}
                    pool={pool}
                    userStake={userStake}
                    userBalance={userMxuBalance}
                    onStake={(amount) => handleStake(pool.id, amount)}
                    onUnstake={() => userStake && handleUnstake(userStake.id)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Fee Discount Tiers */}
        <FeeDiscountTiers
          tiers={discountTiers}
          userBalance={userMxuBalance}
          currentTier={currentTier}
        />
      </div>
    </DashboardLayout>
  );
}
