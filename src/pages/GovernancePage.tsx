import { useState, useEffect, useCallback } from 'react';
import { Plus, Vote, Loader2, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatCard } from '@/components/dashboard/StatCard';
import { ProposalCard } from '@/components/governance/ProposalCard';
import { CreateProposalModal } from '@/components/governance/CreateProposalModal';
import { GovernanceProposal, ProposalStatus, MIN_MXG_TO_CREATE_PROPOSAL } from '@/types/governance';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function GovernancePage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mxgBalance, setMxgBalance] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('active');

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch proposals
      const { data: proposalsData, error: proposalsError } = await supabase
        .from('governance_proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (proposalsError) throw proposalsError;
      setProposals((proposalsData || []) as GovernanceProposal[]);

      // Fetch MXG balance - find MXG token and user's holding
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
      console.error('Error fetching governance data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filterProposals = (status: string): GovernanceProposal[] => {
    if (status === 'all') return proposals;
    if (status === 'active') return proposals.filter(p => p.status === 'ACTIVE');
    if (status === 'passed') return proposals.filter(p => ['PASSED', 'EXECUTED'].includes(p.status));
    if (status === 'rejected') return proposals.filter(p => ['REJECTED', 'CANCELLED'].includes(p.status));
    return proposals;
  };

  const activeCount = proposals.filter(p => p.status === 'ACTIVE').length;
  const passedCount = proposals.filter(p => ['PASSED', 'EXECUTED'].includes(p.status)).length;
  const totalVotingPower = proposals.reduce((acc, p) => acc + p.votes_for + p.votes_against + p.votes_abstain, 0);

  if (isLoading) {
    return (
      <DashboardLayout title="Governance" subtitle="MXG token holder voting">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Governance" subtitle="MXG token holder voting">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Your MXG Balance"
          value={mxgBalance.toLocaleString()}
          icon={<Vote className="h-6 w-6" />}
          subtitle="Voting power"
        />
        <StatCard
          title="Active Proposals"
          value={activeCount}
          icon={<Vote className="h-6 w-6" />}
          subtitle="Open for voting"
        />
        <StatCard
          title="Passed Proposals"
          value={passedCount}
          icon={<Vote className="h-6 w-6" />}
          subtitle="Approved by voters"
        />
        <StatCard
          title="Total Votes Cast"
          value={totalVotingPower.toLocaleString()}
          icon={<Vote className="h-6 w-6" />}
          subtitle="All-time participation"
        />
      </div>

      {/* MXG Balance Warning */}
      {mxgBalance < MIN_MXG_TO_CREATE_PROPOSAL && (
        <Alert className="mb-6 border-warning/50 bg-warning/10">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            You need at least {MIN_MXG_TO_CREATE_PROPOSAL} MXG to create proposals. 
            Current balance: {mxgBalance.toLocaleString()} MXG
          </AlertDescription>
        </Alert>
      )}

      {/* Proposals Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Proposals</h2>
          <Button 
            onClick={() => setIsCreateModalOpen(true)}
            className="gold-gradient text-primary-foreground"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Proposal
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
            <TabsTrigger value="passed">Passed ({passedCount})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          {['active', 'passed', 'rejected', 'all'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {filterProposals(tab).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No proposals found
                </div>
              ) : (
                <div className="grid gap-4">
                  {filterProposals(tab).map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <CreateProposalModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchData}
        mxgBalance={mxgBalance}
      />
    </DashboardLayout>
  );
}
