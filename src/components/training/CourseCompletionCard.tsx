import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, CheckCircle, Loader2, PartyPopper } from 'lucide-react';
import { TrainingCourse } from '@/types/training';
import { useTrainingProgress } from '@/hooks/useTrainingProgress';

interface CourseCompletionCardProps {
  course: TrainingCourse;
  isCompleted: boolean;
  rewardClaimed: boolean;
  onRewardClaimed: () => void;
}

export function CourseCompletionCard({ 
  course, 
  isCompleted, 
  rewardClaimed,
  onRewardClaimed 
}: CourseCompletionCardProps) {
  const { claimReward, updating } = useTrainingProgress();
  const [claimed, setClaimed] = useState(rewardClaimed);

  const handleClaimReward = async () => {
    const success = await claimReward(course.id);
    if (success) {
      setClaimed(true);
      onRewardClaimed();
    }
  };

  if (!isCompleted) return null;

  return (
    <Card className="border-green-500/50 bg-green-500/5">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
            <PartyPopper className="h-6 w-6 text-green-500" />
          </div>
          <div>
            <CardTitle className="text-green-600 dark:text-green-400">
              Course Completed!
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Congratulations on finishing {course.title}
            </p>
          </div>
        </div>
      </CardHeader>
      
      {course.mxg_reward_amount > 0 && (
        <CardContent>
          <div className="flex items-center justify-between rounded-lg bg-background/50 p-4">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="font-semibold">Reward Available</p>
                <p className="text-2xl font-bold text-primary">
                  {course.mxg_reward_amount} MXG
                </p>
              </div>
            </div>
            
            {claimed ? (
              <Badge className="bg-green-500">
                <CheckCircle className="mr-1 h-4 w-4" />
                Claimed
              </Badge>
            ) : (
              <Button onClick={handleClaimReward} disabled={updating}>
                {updating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <Trophy className="mr-2 h-4 w-4" />
                    Claim Reward
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
