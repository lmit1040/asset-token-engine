import { useState } from 'react';
import { Lock, Unlock, TrendingUp, Clock, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StakingPoolType, UserStake } from '@/types/staking';

interface StakingPoolProps {
  pool: StakingPoolType;
  userStake?: UserStake;
  userBalance: number;
  onStake: (amount: number) => void;
  onUnstake: () => void;
}

export function StakingPool({ pool, userStake, userBalance, onStake, onUnstake }: StakingPoolProps) {
  const [stakeAmount, setStakeAmount] = useState('');
  const [isStaking, setIsStaking] = useState(false);

  const handleStake = async () => {
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > userBalance) return;
    if (amount < pool.min_stake_amount) return;

    setIsStaking(true);
    await onStake(amount);
    setStakeAmount('');
    setIsStaking(false);
  };

  const handleMaxClick = () => {
    setStakeAmount(userBalance.toString());
  };

  const tokenSymbol = pool.token_definition?.token_symbol || 'TOKEN';

  return (
    <div className="border border-border rounded-xl p-5 bg-card/50 hover:bg-card/80 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">{pool.pool_name}</h3>
          <p className="text-sm text-muted-foreground">
            {tokenSymbol} Staking Pool
          </p>
        </div>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
          <TrendingUp className="h-3 w-3 mr-1" />
          {pool.apy_percentage}% APY
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Total Staked</p>
          <p className="font-medium text-foreground">
            {pool.total_staked.toLocaleString()} {tokenSymbol}
          </p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Lock Period</p>
          <p className="font-medium text-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {pool.lock_period_days > 0 ? `${pool.lock_period_days} days` : 'Flexible'}
          </p>
        </div>
      </div>

      {userStake ? (
        <div className="space-y-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Your Stake</span>
              <span className="font-semibold text-foreground">
                {userStake.staked_amount.toLocaleString()} {tokenSymbol}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Rewards Earned</span>
              <span className="font-semibold text-primary">
                +{userStake.rewards_earned.toFixed(4)} {tokenSymbol}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={onUnstake}
          >
            <Unlock className="h-4 w-4 mr-2" />
            Unstake
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type="number"
                placeholder={`Min ${pool.min_stake_amount}`}
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="pr-16"
              />
              <button
                type="button"
                onClick={handleMaxClick}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary hover:text-primary/80 font-medium"
              >
                MAX
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Available: {userBalance.toLocaleString()} {tokenSymbol}</span>
            <span>Min: {pool.min_stake_amount.toLocaleString()}</span>
          </div>
          <Button
            className="w-full"
            onClick={handleStake}
            disabled={isStaking || !stakeAmount || parseFloat(stakeAmount) <= 0}
          >
            <Lock className="h-4 w-4 mr-2" />
            {isStaking ? 'Staking...' : 'Stake'}
          </Button>
        </div>
      )}
    </div>
  );
}
