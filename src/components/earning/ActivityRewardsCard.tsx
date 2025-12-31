import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Gift, 
  FileUp, 
  User, 
  Vote, 
  CheckCircle, 
  Clock,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { ActivityReward, RewardConfiguration } from '@/types/rewards';

interface ActivityRewardsCardProps {
  rewards: ActivityReward[];
  configurations: RewardConfiguration[];
  onClaimSuccess: () => void;
}

const rewardIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  asset_submission: FileUp,
  profile_complete: User,
  governance_vote: Vote,
  referral_signup: Gift,
  referral_onboarding: Gift,
};

const rewardLabels: Record<string, string> = {
  asset_submission: 'Asset Submission',
  profile_complete: 'Profile Complete',
  governance_vote: 'Governance Vote',
  referral_signup: 'Referral Signup',
  referral_onboarding: 'Referral Onboarding',
};

export function ActivityRewardsCard({ 
  rewards, 
  configurations, 
  onClaimSuccess 
}: ActivityRewardsCardProps) {
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const pendingRewards = rewards.filter(r => r.status === 'pending');
  const claimedRewards = rewards.filter(r => r.status === 'claimed');

  const handleClaim = async (reward: ActivityReward) => {
    setClaimingId(reward.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('claim-activity-reward', {
        body: { rewardId: reward.id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;

      toast.success(`Claimed ${reward.mxg_amount} MXG!`);
      onClaimSuccess();
    } catch (error: any) {
      console.error('Claim error:', error);
      toast.error(error.message || 'Failed to claim reward');
    } finally {
      setClaimingId(null);
    }
  };

  const handleClaimAll = async () => {
    for (const reward of pendingRewards) {
      await handleClaim(reward);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Activity Rewards
          </CardTitle>
          {pendingRewards.length > 1 && (
            <Button size="sm" onClick={handleClaimAll}>
              Claim All ({pendingRewards.length})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Available Reward Types */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Earn MXG by:</p>
          <div className="grid gap-2">
            {configurations.map((config) => {
              const Icon = rewardIcons[config.reward_type] || Gift;
              return (
                <div 
                  key={config.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{config.description}</span>
                  </div>
                  <Badge variant="outline">+{config.mxg_amount} MXG</Badge>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending Rewards */}
        {pendingRewards.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pending Rewards ({pendingRewards.length})
            </p>
            <div className="space-y-2">
              {pendingRewards.map((reward) => {
                const Icon = rewardIcons[reward.reward_type] || Gift;
                return (
                  <div 
                    key={reward.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-yellow-500" />
                      <div>
                        <p className="text-sm font-medium">
                          {rewardLabels[reward.reward_type] || reward.reward_type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(reward.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-yellow-500/20 text-yellow-500">
                        +{reward.mxg_amount} MXG
                      </Badge>
                      <Button 
                        size="sm"
                        onClick={() => handleClaim(reward)}
                        disabled={claimingId === reward.id}
                      >
                        {claimingId === reward.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Claim'
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Claimed Rewards */}
        {claimedRewards.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Recently Claimed
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {claimedRewards.slice(0, 5).map((reward) => {
                const Icon = rewardIcons[reward.reward_type] || Gift;
                return (
                  <div 
                    key={reward.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{rewardLabels[reward.reward_type] || reward.reward_type}</span>
                    </div>
                    <span className="text-green-500">+{reward.mxg_amount} MXG</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pendingRewards.length === 0 && claimedRewards.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Gift className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Complete activities to earn MXG rewards!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
