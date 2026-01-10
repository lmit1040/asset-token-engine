import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RewardsSummary } from '@/components/earning/RewardsSummary';
import { StakingCard } from '@/components/earning/StakingCard';
import { ReferralCard } from '@/components/earning/ReferralCard';
import { ActivityRewardsCard } from '@/components/earning/ActivityRewardsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMxgBalance } from '@/hooks/useMxgBalance';
import { Loader2, Vote, TrendingUp, Users, Gift } from 'lucide-react';
import { format } from 'date-fns';
import type { 
  ActivityReward, 
  RewardConfiguration, 
  StakingPool, 
  UserStake 
} from '@/types/rewards';

export default function MxgEarningPage() {
  const { user } = useAuth();
  const { mxgBalance, refetch: refetchMxgBalance } = useMxgBalance();
  const [isLoading, setIsLoading] = useState(true);
  const [stakingPool, setStakingPool] = useState<StakingPool | null>(null);
  const [userStake, setUserStake] = useState<UserStake | null>(null);
  const [activityRewards, setActivityRewards] = useState<ActivityReward[]>([]);
  const [rewardConfigs, setRewardConfigs] = useState<RewardConfiguration[]>([]);
  const [votingRewards, setVotingRewards] = useState<ActivityReward[]>([]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Fetch MXG token for staking pool lookup
      const { data: mxgToken } = await supabase
        .from('token_definitions')
        .select('id')
        .eq('token_symbol', 'MXG')
        .single();

      if (mxgToken) {
        // Fetch staking pool for MXG
        const { data: pools } = await supabase
          .from('staking_pools')
          .select('*')
          .eq('token_definition_id', mxgToken.id)
          .eq('is_active', true)
          .limit(1);

        if (pools && pools.length > 0) {
          setStakingPool(pools[0] as StakingPool);

          // Fetch user's stake
          const { data: stakes } = await supabase
            .from('user_stakes')
            .select('*')
            .eq('user_id', user.id)
            .eq('staking_pool_id', pools[0].id)
            .eq('is_active', true)
            .limit(1);

          if (stakes && stakes.length > 0) {
            setUserStake(stakes[0] as UserStake);
          }
        }
      }

      // Fetch reward configurations
      const { data: configs } = await supabase
        .from('reward_configurations')
        .select('*')
        .eq('is_active', true);

      if (configs) {
        setRewardConfigs(configs as RewardConfiguration[]);
      }

      // Fetch activity rewards
      const { data: rewards } = await supabase
        .from('activity_rewards')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (rewards) {
        const allRewards = rewards as ActivityReward[];
        setActivityRewards(allRewards.filter(r => r.reward_type !== 'governance_vote'));
        setVotingRewards(allRewards.filter(r => r.reward_type === 'governance_vote'));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalEarned = activityRewards
    .filter(r => r.status === 'claimed')
    .reduce((sum, r) => sum + r.mxg_amount, 0) + 
    (userStake?.rewards_earned || 0);

  const pendingRewards = activityRewards
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + r.mxg_amount, 0);

  const stakingRewards = userStake?.rewards_earned || 0;

  const referralRewards = activityRewards
    .filter(r => r.reward_type === 'referral_signup' || r.reward_type === 'referral_onboarding')
    .filter(r => r.status === 'claimed')
    .reduce((sum, r) => sum + r.mxg_amount, 0);

  const signupRewardConfig = rewardConfigs.find(c => c.reward_type === 'referral_signup');
  const onboardingRewardConfig = rewardConfigs.find(c => c.reward_type === 'referral_onboarding');

  if (isLoading) {
    return (
      <DashboardLayout title="Earn MXG" subtitle="Stake, refer, and complete activities to earn governance tokens">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="Earn MXG" 
      subtitle="Stake, refer, and complete activities to earn governance tokens"
    >
      <div className="space-y-6 animate-fade-in">
        <RewardsSummary
          totalEarned={totalEarned}
          pendingRewards={pendingRewards}
          stakingRewards={stakingRewards}
          referralRewards={referralRewards}
        />

        <Tabs defaultValue="staking" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-lg">
            <TabsTrigger value="staking" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Staking</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Gift className="h-4 w-4" />
              <span className="hidden sm:inline">Activity</span>
            </TabsTrigger>
            <TabsTrigger value="referrals" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Referrals</span>
            </TabsTrigger>
            <TabsTrigger value="voting" className="flex items-center gap-2">
              <Vote className="h-4 w-4" />
              <span className="hidden sm:inline">Voting</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="staking">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StakingCard
                pool={stakingPool}
                userStake={userStake}
                mxgBalance={mxgBalance}
                onStakeChange={() => { fetchData(); refetchMxgBalance(); }}
              />
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">How Staking Works</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Stake your MXG tokens to earn passive rewards. The longer you stake,
                    the more you earn!
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Earn {stakingPool?.apy_percentage || 8}% APY on staked tokens</li>
                    <li>Minimum stake: {stakingPool?.min_stake_amount || 10} MXG</li>
                    <li>Lock period: {stakingPool?.lock_period_days || 30} days</li>
                    <li>Rewards calculated daily</li>
                    <li>Claim stake + rewards after lock period</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ActivityRewardsCard
                rewards={activityRewards}
                configurations={rewardConfigs.filter(c => 
                  c.reward_type !== 'referral_signup' && 
                  c.reward_type !== 'referral_onboarding'
                )}
                onClaimSuccess={() => { fetchData(); refetchMxgBalance(); }}
              />
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">Earning Activities</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Complete actions on the platform to earn MXG rewards. These 
                    activities help grow and secure the MetallumX ecosystem.
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Submit assets for tokenization</li>
                    <li>Complete your profile</li>
                    <li>Participate in governance voting</li>
                    <li>Invite friends via referral program</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="referrals">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ReferralCard
                signupReward={signupRewardConfig?.mxg_amount || 25}
                onboardingReward={onboardingRewardConfig?.mxg_amount || 100}
              />
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">Referral Program</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Invite friends to MetallumX and earn MXG for each successful referral!
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Get +{signupRewardConfig?.mxg_amount || 25} MXG when friend signs up</li>
                    <li>Get +{onboardingRewardConfig?.mxg_amount || 100} MXG when friend completes onboarding</li>
                    <li>No limit on referrals</li>
                    <li>Share your unique code or link</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="voting">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Vote className="h-5 w-5 text-primary" />
                    Voting Rewards History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {votingRewards.length > 0 ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {votingRewards.map((reward) => (
                        <div 
                          key={reward.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                        >
                          <div>
                            <p className="text-sm font-medium">Governance Vote</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(reward.created_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <Badge 
                            variant={reward.status === 'claimed' ? 'default' : 'secondary'}
                            className={reward.status === 'claimed' ? 'bg-green-500' : ''}
                          >
                            +{reward.mxg_amount} MXG
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Vote className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No voting rewards yet</p>
                      <p className="text-xs mt-1">Vote on proposals to earn MXG!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">Voting Rewards</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Participate in governance by voting on proposals and earn MXG 
                    for each vote cast.
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>+5 MXG per proposal vote</li>
                    <li>Vote on any active proposal</li>
                    <li>Rewards are automatic</li>
                    <li>Shape the future of MetallumX</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
