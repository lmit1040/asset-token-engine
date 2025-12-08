import { Link } from 'react-router-dom';
import { Clock, Users, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GovernanceProposal, PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS, PROPOSAL_TYPE_LABELS } from '@/types/governance';
import { formatDistanceToNow, isPast, parseISO } from 'date-fns';

interface ProposalCardProps {
  proposal: GovernanceProposal;
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const totalVotes = proposal.votes_for + proposal.votes_against + proposal.votes_abstain;
  const forPercentage = totalVotes > 0 ? (proposal.votes_for / totalVotes) * 100 : 0;
  const againstPercentage = totalVotes > 0 ? (proposal.votes_against / totalVotes) * 100 : 0;

  const isVotingActive = proposal.status === 'ACTIVE' && 
    proposal.voting_ends_at && 
    !isPast(parseISO(proposal.voting_ends_at));

  const timeRemaining = proposal.voting_ends_at 
    ? formatDistanceToNow(parseISO(proposal.voting_ends_at), { addSuffix: true })
    : null;

  return (
    <Link to={`/governance/${proposal.id}`}>
      <Card className="glass-card-hover cursor-pointer">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">
                  {PROPOSAL_TYPE_LABELS[proposal.proposal_type]}
                </Badge>
                <Badge className={PROPOSAL_STATUS_COLORS[proposal.status]}>
                  {PROPOSAL_STATUS_LABELS[proposal.status]}
                </Badge>
              </div>
              <h3 className="text-lg font-semibold text-foreground truncate">
                {proposal.title}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {proposal.description}
              </p>
            </div>
          </div>

          {/* Voting Progress */}
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-success">
                <ThumbsUp className="h-4 w-4" />
                <span>For: {forPercentage.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2 text-destructive">
                <ThumbsDown className="h-4 w-4" />
                <span>Against: {againstPercentage.toFixed(1)}%</span>
              </div>
            </div>
            <div className="flex gap-1 h-2">
              <div 
                className="bg-success rounded-l-full transition-all" 
                style={{ width: `${forPercentage}%` }}
              />
              <div 
                className="bg-destructive rounded-r-full transition-all" 
                style={{ width: `${againstPercentage}%` }}
              />
              {totalVotes === 0 && (
                <div className="bg-muted flex-1 rounded-full" />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <span>{totalVotes.toLocaleString()} votes</span>
              </div>
              {isVotingActive && timeRemaining && (
                <div className="flex items-center gap-1 text-primary">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Ends {timeRemaining}</span>
                </div>
              )}
            </div>
            <span>
              Quorum: {proposal.quorum_percentage}%
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
