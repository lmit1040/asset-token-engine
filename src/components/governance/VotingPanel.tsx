import { useState } from 'react';
import { ThumbsUp, ThumbsDown, MinusCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VoteChoice, ProposalVote } from '@/types/governance';
import { cn } from '@/lib/utils';

interface VotingPanelProps {
  proposalId: string;
  userVote: ProposalVote | null;
  mxgBalance: number;
  isVotingActive: boolean;
  onVote: (choice: VoteChoice) => Promise<void>;
}

export function VotingPanel({ 
  proposalId, 
  userVote, 
  mxgBalance, 
  isVotingActive,
  onVote 
}: VotingPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVote, setSelectedVote] = useState<VoteChoice | null>(null);

  const handleVote = async (choice: VoteChoice) => {
    setSelectedVote(choice);
    setIsSubmitting(true);
    try {
      await onVote(choice);
    } finally {
      setIsSubmitting(false);
      setSelectedVote(null);
    }
  };

  const canVote = isVotingActive && mxgBalance > 0;

  const voteOptions: { choice: VoteChoice; label: string; icon: typeof ThumbsUp; color: string }[] = [
    { choice: 'FOR', label: 'Vote For', icon: ThumbsUp, color: 'text-success hover:bg-success/20' },
    { choice: 'AGAINST', label: 'Vote Against', icon: ThumbsDown, color: 'text-destructive hover:bg-destructive/20' },
    { choice: 'ABSTAIN', label: 'Abstain', icon: MinusCircle, color: 'text-muted-foreground hover:bg-muted' },
  ];

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg">Cast Your Vote</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {userVote ? (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-2">You voted:</p>
            <div className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium",
              userVote.vote === 'FOR' && "bg-success/15 text-success",
              userVote.vote === 'AGAINST' && "bg-destructive/15 text-destructive",
              userVote.vote === 'ABSTAIN' && "bg-muted text-muted-foreground"
            )}>
              {userVote.vote === 'FOR' && <ThumbsUp className="h-4 w-4" />}
              {userVote.vote === 'AGAINST' && <ThumbsDown className="h-4 w-4" />}
              {userVote.vote === 'ABSTAIN' && <MinusCircle className="h-4 w-4" />}
              {userVote.vote}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Voting power: {userVote.voting_power.toLocaleString()} MXG
            </p>
          </div>
        ) : canVote ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Your voting power: <span className="font-semibold text-foreground">{mxgBalance.toLocaleString()} MXG</span>
            </p>
            <div className="grid gap-2">
              {voteOptions.map(({ choice, label, icon: Icon, color }) => (
                <Button
                  key={choice}
                  variant="outline"
                  className={cn("justify-start gap-3 h-12", color)}
                  onClick={() => handleVote(choice)}
                  disabled={isSubmitting}
                >
                  {isSubmitting && selectedVote === choice ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ) : !isVotingActive ? (
          <p className="text-center text-muted-foreground py-4">
            Voting has ended for this proposal
          </p>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-2">
              You need MXG tokens to vote
            </p>
            <p className="text-xs text-muted-foreground">
              Your MXG balance: {mxgBalance.toLocaleString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
