export type TransferRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface TransferRequest {
  id: string;
  token_definition_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  status: TransferRequestStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TransferRequestWithDetails extends TransferRequest {
  token_symbol?: string;
  token_name?: string;
  from_user_email?: string;
  from_user_name?: string;
  to_user_email?: string;
  to_user_name?: string;
}
