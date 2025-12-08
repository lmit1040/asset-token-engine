export type AttestationStatus = 'PENDING' | 'ATTESTED' | 'REJECTED';

export interface Attestation {
  id: string;
  asset_id: string;
  attested_by: string | null;
  attestation_date: string;
  status: AttestationStatus;
  notes: string | null;
  verification_hash: string | null;
  proof_file_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface AttestationWithDetails extends Attestation {
  asset_name?: string;
  attested_by_name?: string;
  attested_by_email?: string;
}
