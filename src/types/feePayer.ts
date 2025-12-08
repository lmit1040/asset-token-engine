export interface FeePayerKey {
  id: string;
  public_key: string;
  label: string;
  is_active: boolean;
  last_used_at: string | null;
  balance_sol: number;
  usage_count: number;
  created_at: string;
}
