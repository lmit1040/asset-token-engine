import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, User, Calendar, Loader2, ThumbsUp, ThumbsDown, MinusCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { VotingPanel } from '@/components/governance/VotingPanel';
import { 
  GovernanceProposal, 
  ProposalVote, 
  VoteChoice,
  PROPOSAL_STATUS_LABELS, 
  PROPOSAL_STATUS_COLORS,
  PROPOSAL_TYPE_LABELS 
} from '@/types/governance';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns';

export default function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [proposal, setProposal] = useState<GovernanceProposal | null>(null);
  const [userVote, setUserVote] = useState<ProposalVote | null>(null);
  const [mxgBalance, setMxgBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id || !user) return;

    try {
      // Fetch proposal
      const { data: proposalData, error: proposalError } = await supabase
        .from('governance_proposals')
        .select('*')
        .eq('id', id)
        .single();

      if (proposalError) throw proposalError;
      setProposal(proposalData as GovernanceProposal);

      // Fetch user's vote
      const { data: voteData } = await supabase
        .from('proposal_votes')
        .select('*')
        .eq('proposal_id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      setUserVote(voteData as ProposalVote | null);

      // Fetch MXG balance
      const { data: mxgToken } = await supabase
        .from('token_definitions')
        .select('id')
        .eq('token_symbol', 'MXG')
        .maybeSingle();

      if (mxgToken) {
        const { data: holding } = await supabase
          .from('user_token_holdings')
          .select('balance')
          .eq('user_id', user.id)
          .eq('token_definition_id', mxgToken.id)
          .maybeSingle();

        setMxgBalance(holding?.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching proposal:', error);
      toast({
        title: 'Error',
        description: 'Failed to load proposal details.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, user, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleVote = async (choice: VoteChoice) => {
    if (!user || !proposal) return;

    try {
      // Insert vote
      const { error: voteError } = await supabase
        .from('proposal_votes')
        .insert({
          proposal_id: proposal.id,
          user_id: user.id,
          vote: choice,
          voting_power: mxgBalance,
        });

      if (voteError) throw voteError;

      // Update proposal vote counts
      const voteField = choice === 'FOR' ? 'votes_for' : 
                        choice === 'AGAINST' ? 'votes_against' : 'votes_abstain';

      const { error: updateError } = await supabase
        .from('governance_proposals')
        .update({
          [voteField]: proposal[voteField] + mxgBalance,
        })
        .eq('id', proposal.id);

      if (updateError) throw updateError;

      toast({
        title: 'Vote recorded',
        description: `You voted ${choice} with ${mxgBalance.toLocaleString()} MXG.`,
      });

      fetchData();
    } catch (error) {
      console.error('Error voting:', error);
      toast({
        title: 'Error',
        description: 'Failed to record your vote. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Proposal" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!proposal) {
    return (
      <DashboardLayout title="Proposal" subtitle="Not found">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Proposal not found</p>
          <Button onClick={() => navigate('/governance')}>Back to Governance</Button>
        </div>
      </DashboardLayout>
    );
  }

  const totalVotes = proposal.votes_for + proposal.votes_against + proposal.votes_abstain;
  const forPercentage = totalVotes > 0 ? (proposal.votes_for / totalVotes) * 100 : 0;
  const againstPercentage = totalVotes > 0 ? (proposal.votes_against / totalVotes) * 100 : 0;
  const abstainPercentage = totalVotes > 0 ? (proposal.votes_abstain / totalVotes) * 100 : 0;

  const isVotingActive = proposal.status === 'ACTIVE' && 
    proposal.voting_ends_at && 
    !isPast(parseISO(proposal.voting_ends_at));

  return (
    <DashboardLayout title={proposal.title} subtitle="Governance Proposal">
      <div className="mb-6">
        <Link 
          to="/governance" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Governance
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card">
            <CardContent className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">
                      {PROPOSAL_TYPE_LABELS[proposal.proposal_type]}
                    </Badge>
                    <Badge className={PROPOSAL_STATUS_COLORS[proposal.status]}>
                      {PROPOSAL_STATUS_LABELS[proposal.status]}
                    </Badge>
                  </div>
                  <h1 className="text-2xl font-bold text-foreground">{proposal.title}</h1>
                </div>
              </div>

              {/* Description */}
              <div className="prose prose-invert max-w-none mb-8">
                <p className="text-foreground whitespace-pre-wrap">{proposal.description}</p>
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap gap-6 text-sm text-muted-foreground border-t border-border pt-6">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Created {format(parseISO(proposal.created_at), 'MMM d, yyyy')}
                </div>
                {proposal.voting_ends_at && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {isPast(parseISO(proposal.voting_ends_at)) 
                      ? 'Voting ended' 
                      : `Ends ${formatDistanceToNow(parseISO(proposal.voting_ends_at), { addSuffix: true })}`}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Voting Results */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Voting Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* For */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-success" />
                    <span className="font-medium">For</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {proposal.votes_for.toLocaleString()} MXG ({forPercentage.toFixed(1)}%)
                  </span>
                </div>
                <Progress value={forPercentage} className="h-3 bg-muted" />
              </div>

              {/* Against */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="h-4 w-4 text-destructive" />
                    <span className="font-medium">Against</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {proposal.votes_against.toLocaleString()} MXG ({againstPercentage.toFixed(1)}%)
                  </span>
                </div>
                <Progress value={againstPercentage} className="h-3 bg-muted [&>div]:bg-destructive" />
              </div>

              {/* Abstain */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MinusCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Abstain</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {proposal.votes_abstain.toLocaleString()} MXG ({abstainPercentage.toFixed(1)}%)
                  </span>
                </div>
                <Progress value={abstainPercentage} className="h-3 bg-muted [&>div]:bg-muted-foreground" />
              </div>

              {/* Summary */}
              <div className="flex items-center justify-between pt-4 border-t border-border text-sm">
                <span className="text-muted-foreground">Total votes</span>
                <span className="font-medium">{totalVotes.toLocaleString()} MXG</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Quorum required</span>
                <span className="font-medium">{proposal.quorum_percentage}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pass threshold</span>
                <span className="font-medium">{proposal.pass_threshold_percentage}%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <VotingPanel
            proposalId={proposal.id}
            userVote={userVote}
            mxgBalance={mxgBalance}
            isVotingActive={isVotingActive}
            onVote={handleVote}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
