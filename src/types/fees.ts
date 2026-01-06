export type FeeType = 'ONE_TIME' | 'PER_TRANSACTION' | 'PER_EXECUTION' | 'MONTHLY' | 'ANNUAL';
export type FeeCategory = 'ASSET' | 'TOKEN' | 'ATTESTATION' | 'REGISTRY' | 'GOVERNANCE' | 'OPS';
export type PricingTier = 'RETAIL' | 'TRUST' | 'ENTERPRISE';

export interface FeeCatalogItem {
  id: string;
  fee_key: string;
  tier: PricingTier;
  description: string;
  amount_cents: number;
  fee_type: FeeType;
  applies_to: FeeCategory;
  intro_price: boolean;
  enabled: boolean;
  created_at: string;
}

export interface FeeVersion {
  id: string;
  fee_key: string;
  old_amount_cents: number;
  new_amount_cents: number;
  effective_date: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  ONE_TIME: 'One-Time',
  PER_TRANSACTION: 'Per Transaction',
  PER_EXECUTION: 'Per Execution',
  MONTHLY: 'Monthly',
  ANNUAL: 'Annual',
};

export const FEE_CATEGORY_LABELS: Record<FeeCategory, string> = {
  ASSET: 'Asset Management',
  TOKEN: 'Token Operations',
  ATTESTATION: 'Attestations',
  REGISTRY: 'Registry Services',
  GOVERNANCE: 'Governance',
  OPS: 'Platform Operations',
};

export const TIER_LABELS: Record<PricingTier, string> = {
  RETAIL: 'Individual',
  TRUST: 'Trust / LLC',
  ENTERPRISE: 'Enterprise',
};

// MXU discounts only apply to these fee types
export const MXU_DISCOUNT_ELIGIBLE_TYPES: FeeType[] = ['ONE_TIME', 'PER_EXECUTION', 'PER_TRANSACTION'];

export const FEE_TYPE_COLORS: Record<FeeType, string> = {
  ONE_TIME: 'bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400',
  PER_TRANSACTION: 'bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400',
  PER_EXECUTION: 'bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400',
  MONTHLY: 'bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400',
  ANNUAL: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30 dark:text-indigo-400',
};
