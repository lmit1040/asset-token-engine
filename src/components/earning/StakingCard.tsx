import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Lock, Unlock, TrendingUp, Calendar, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, differenceInDays } from 'date-fns';
import { HelpTooltip } from '@/components/help/HelpTooltip';
import type { StakingPool, UserStake } from '@/types/rewards';

interface StakingCardProps {
  pool: StakingPool | null;
  userStake: UserStake | null;
  mxgBalance: number;
  onStakeChange: () => void;
}

export function StakingCard({ pool, userStake, mxgBalance, onStakeChange }: StakingCardProps) {
  const [stakeAmount, setStakeAmount] = useState('');
  const [isStaking, setIsStaking] = useState(false);
  const [isUnstaking, setIsUnstaking] = useState(false);

  const handleStake = async () => {
    if (!pool) return;
    
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (amount < pool.min_stake_amount) {
      toast.error(`Minimum stake is ${pool.min_stake_amount} MXG`);
      return;
    }

    if (amount > mxgBalance) {
      toast.error('Insufficient MXG balance');
      return;
    }

    setIsStaking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const unlockDate = addDays(new Date(), pool.lock_period_days).toISOString();

      if (userStake) {
        // Update existing stake
        const { error } = await supabase
          .from('user_stakes')
          .update({
            staked_amount: userStake.staked_amount + amount,
            unlock_at: unlockDate,
          })
          .eq('id', userStake.id);

        if (error) throw error;
      } else {
        // Create new stake
        const { error } = await supabase
          .from('user_stakes')
          .insert({
            user_id: user.id,
            staking_pool_id: pool.id,
            staked_amount: amount,
            unlock_at: unlockDate,
            is_active: true,
          });

        if (error) throw error;
      }

      // Deduct from MXG balance
      const { data: holding } = await supabase
        .from('user_token_holdings')
        .select('*')
        .eq('user_id', user.id)
        .eq('token_definition_id', pool.token_definition_id)
        .single();

      if (holding) {
        await supabase
          .from('user_token_holdings')
          .update({ balance: holding.balance - amount })
          .eq('id', holding.id);
      }

      // Update pool total
      await supabase
        .from('staking_pools')
        .update({ total_staked: pool.total_staked + amount })
        .eq('id', pool.id);

      toast.success(`Successfully staked ${amount} MXG`);
      setStakeAmount('');
      onStakeChange();
    } catch (error: any) {
      console.error('Staking error:', error);
      toast.error(error.message || 'Failed to stake');
    } finally {
      setIsStaking(false);
    }
  };

  const handleUnstake = async () => {
    if (!pool || !userStake) return;

    if (userStake.unlock_at && new Date(userStake.unlock_at) > new Date()) {
      toast.error('Tokens are still locked');
      return;
    }

    setIsUnstaking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const totalReturn = userStake.staked_amount + userStake.rewards_earned;

      // Deactivate stake
      await supabase
        .from('user_stakes')
        .update({ is_active: false })
        .eq('id', userStake.id);

      // Return tokens to balance
      const { data: holding } = await supabase
        .from('user_token_holdings')
        .select('*')
        .eq('user_id', user.id)
        .eq('token_definition_id', pool.token_definition_id)
        .single();

      if (holding) {
        await supabase
          .from('user_token_holdings')
          .update({ balance: holding.balance + totalReturn })
          .eq('id', holding.id);
      } else {
        await supabase
          .from('user_token_holdings')
          .insert({
            user_id: user.id,
            token_definition_id: pool.token_definition_id,
            balance: totalReturn,
          });
      }

      // Update pool total
      await supabase
        .from('staking_pools')
        .update({ total_staked: Math.max(0, pool.total_staked - userStake.staked_amount) })
        .eq('id', pool.id);

      toast.success(`Unstaked ${totalReturn.toFixed(2)} MXG (including ${userStake.rewards_earned.toFixed(2)} rewards)`);
      onStakeChange();
    } catch (error: any) {
      console.error('Unstaking error:', error);
      toast.error(error.message || 'Failed to unstake');
    } finally {
      setIsUnstaking(false);
    }
  };

  const isLocked = userStake?.unlock_at && new Date(userStake.unlock_at) > new Date();
  const daysRemaining = userStake?.unlock_at 
    ? Math.max(0, differenceInDays(new Date(userStake.unlock_at), new Date()))
    : 0;
  const lockProgress = pool?.lock_period_days 
    ? ((pool.lock_period_days - daysRemaining) / pool.lock_period_days) * 100
    : 0;

  if (!pool) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center text-muted-foreground">
          <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No staking pool available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {pool.pool_name}
            <HelpTooltip content="Stake your MXG tokens to earn passive rewards. Tokens are locked for the specified period." />
          </CardTitle>
          <Badge variant="secondary" className="text-green-500">
            {pool.apy_percentage}% APY
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {userStake && userStake.is_active && (
          <div className="p-4 rounded-lg bg-muted/50 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your Stake</span>
              <span className="font-medium">{userStake.staked_amount.toLocaleString()} MXG</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Rewards Earned</span>
              <span className="font-medium text-green-500">+{userStake.rewards_earned.toFixed(4)} MXG</span>
            </div>
            {isLocked && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Unlock Progress
                  </span>
                  <span>{daysRemaining} days remaining</span>
                </div>
                <Progress value={lockProgress} className="h-2" />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Unlocks {format(new Date(userStake.unlock_at!), 'MMM d, yyyy')}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Amount to stake"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              min={pool.min_stake_amount}
              max={mxgBalance}
            />
            <Button 
              onClick={handleStake} 
              disabled={isStaking || !stakeAmount}
            >
              {isStaking ? 'Staking...' : 'Stake'}
            </Button>
          </div>
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Min: {pool.min_stake_amount} MXG</span>
            <span>Available: {mxgBalance.toLocaleString()} MXG</span>
          </div>

          {userStake && userStake.is_active && (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleUnstake}
              disabled={isUnstaking || isLocked}
            >
              {isLocked ? (
                <>
                  <Lock className="h-4 w-4 mr-2" /> Locked
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4 mr-2" />
                  {isUnstaking ? 'Unstaking...' : 'Unstake All'}
                </>
              )}
            </Button>
          )}
        </div>

        <div className="pt-2 border-t border-border text-xs text-muted-foreground space-y-1">
          <p>• Lock period: {pool.lock_period_days} days</p>
          <p>• Total staked in pool: {pool.total_staked.toLocaleString()} MXG</p>
        </div>
      </CardContent>
    </Card>
  );
}
