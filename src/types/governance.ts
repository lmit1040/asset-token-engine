export type ProposalType = 'PARAMETER_CHANGE' | 'TOKEN_ADDITION' | 'FEE_ADJUSTMENT' | 'GENERAL';
export type ProposalStatus = 'DRAFT' | 'ACTIVE' | 'PASSED' | 'REJECTED' | 'EXECUTED' | 'CANCELLED';
export type VoteChoice = 'FOR' | 'AGAINST' | 'ABSTAIN';

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposal_type: ProposalType;
  status: ProposalStatus;
  created_by: string | null;
  voting_starts_at: string | null;
  voting_ends_at: string | null;
  quorum_percentage: number;
  pass_threshold_percentage: number;
  execution_data: Record<string, unknown> | null;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  created_at: string;
  updated_at: string;
  creator_email?: string;
}

export interface ProposalVote {
  id: string;
  proposal_id: string;
  user_id: string;
  vote: VoteChoice;
  voting_power: number;
  voted_at: string;
}

export const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  PARAMETER_CHANGE: 'Parameter Change',
  TOKEN_ADDITION: 'Token Addition',
  FEE_ADJUSTMENT: 'Fee Adjustment',
  GENERAL: 'General',
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PASSED: 'Passed',
  REJECTED: 'Rejected',
  EXECUTED: 'Executed',
  CANCELLED: 'Cancelled',
};

export const PROPOSAL_STATUS_COLORS: Record<ProposalStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-primary/15 text-primary',
  PASSED: 'bg-success/15 text-success',
  REJECTED: 'bg-destructive/15 text-destructive',
  EXECUTED: 'bg-success/15 text-success',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export const MIN_MXG_TO_CREATE_PROPOSAL = 100; // Minimum MXG balance to create a proposal
export const MIN_MXG_TO_VOTE = 1; // Minimum MXG balance to vote
