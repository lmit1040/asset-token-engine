export type SubmissionStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface UserAssetSubmission {
  id: string;
  user_id: string;
  submitted_by_role: string;
  asset_type: string;
  title: string;
  description: string | null;
  estimated_quantity: number | null;
  unit: string | null;
  location_description: string | null;
  documents: Record<string, unknown> | null;
  status: SubmissionStatus;
  admin_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_asset_id: string | null;
  created_at: string;
  updated_at: string;
}

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  PENDING: 'Pending Review',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  UNDER_REVIEW: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  APPROVED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/20',
};
