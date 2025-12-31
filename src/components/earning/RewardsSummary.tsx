import { Card, CardContent } from '@/components/ui/card';
import { Coins, Gift, Users, TrendingUp } from 'lucide-react';

interface RewardsSummaryProps {
  totalEarned: number;
  pendingRewards: number;
  stakingRewards: number;
  referralRewards: number;
}

export function RewardsSummary({ 
  totalEarned, 
  pendingRewards, 
  stakingRewards, 
  referralRewards 
}: RewardsSummaryProps) {
  const stats = [
    {
      label: 'Total MXG Earned',
      value: totalEarned.toLocaleString(),
      icon: Coins,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
    {
      label: 'Pending Rewards',
      value: pendingRewards.toLocaleString(),
      icon: Gift,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Staking Rewards',
      value: stakingRewards.toLocaleString(),
      icon: TrendingUp,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Referral Rewards',
      value: referralRewards.toLocaleString(),
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold">{stat.value} MXG</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
