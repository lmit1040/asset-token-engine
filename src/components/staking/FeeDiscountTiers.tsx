import { Check, Percent, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { FeeDiscountTier } from '@/types/staking';
import { cn } from '@/lib/utils';

interface FeeDiscountTiersProps {
  tiers: FeeDiscountTier[];
  userBalance: number;
  currentTier?: FeeDiscountTier;
}

export function FeeDiscountTiers({ tiers, userBalance, currentTier }: FeeDiscountTiersProps) {
  if (tiers.length === 0) {
    return null;
  }

  // Calculate progress to next tier
  const nextTier = tiers.find(t => t.min_balance > userBalance);
  const progressToNext = nextTier
    ? Math.min(100, (userBalance / nextTier.min_balance) * 100)
    : 100;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Percent className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">MXU Holder Benefits</h2>
          <p className="text-sm text-muted-foreground">
            Hold MXU to unlock platform fee discounts
          </p>
        </div>
      </div>

      {/* Progress to next tier */}
      {nextTier && (
        <div className="mb-6 p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Progress to {nextTier.tier_name}</span>
            <span className="text-sm font-medium text-foreground">
              {userBalance.toLocaleString()} / {nextTier.min_balance.toLocaleString()} MXU
            </span>
          </div>
          <Progress value={progressToNext} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            Hold {(nextTier.min_balance - userBalance).toLocaleString()} more MXU to unlock {nextTier.discount_percentage}% discount
          </p>
        </div>
      )}

      {/* Tier cards */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => {
          const isActive = currentTier?.id === tier.id;
          const isUnlocked = userBalance >= tier.min_balance;

          return (
            <div
              key={tier.id}
              className={cn(
                'relative border rounded-xl p-4 transition-all',
                isActive
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : isUnlocked
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-card/30'
              )}
            >
              {isActive && (
                <div className="absolute -top-2 -right-2">
                  <Badge className="bg-primary text-primary-foreground">
                    <Check className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center',
                    isUnlocked ? 'bg-primary/20' : 'bg-muted'
                  )}
                >
                  <TrendingUp
                    className={cn(
                      'h-4 w-4',
                      isUnlocked ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                </div>
                <h3 className={cn(
                  'font-semibold',
                  isUnlocked ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {tier.tier_name}
                </h3>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <span className={cn(
                    'text-2xl font-bold',
                    isUnlocked ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {tier.discount_percentage}%
                  </span>
                  <span className="text-sm text-muted-foreground">off fees</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Hold {tier.min_balance.toLocaleString()} MXU
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
