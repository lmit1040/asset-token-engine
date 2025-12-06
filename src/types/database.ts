export type AssetType = 'GOLDBACK' | 'SILVER' | 'COPPER' | 'GOLD_CERTIFICATE' | 'SILVER_CERTIFICATE' | 'OTHER';
export type OwnerEntity = 'PERSONAL_TRUST' | 'BUSINESS_TRUST' | 'SPV_LLC';
export type TokenModel = 'ONE_TO_ONE' | 'FRACTIONAL' | 'VAULT_BASKET';
export type AppRole = 'admin' | 'standard_user';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface Asset {
  id: string;
  asset_type: AssetType;
  name: string;
  quantity: number;
  unit: string;
  storage_location: string | null;
  owner_entity: OwnerEntity;
  acquisition_date: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProofOfReserveFile {
  id: string;
  asset_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_hash: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface TokenDefinition {
  id: string;
  asset_id: string;
  token_name: string;
  token_symbol: string;
  token_model: TokenModel;
  decimals: number;
  total_supply: number;
  notes: string | null;
  created_at: string;
  asset?: Asset;
}

export interface UserTokenHolding {
  id: string;
  user_id: string;
  token_definition_id: string;
  balance: number;
  assigned_by: string | null;
  assigned_at: string;
  token_definition?: TokenDefinition;
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  GOLDBACK: 'Goldback',
  SILVER: 'Silver',
  COPPER: 'Copper',
  GOLD_CERTIFICATE: 'Gold Certificate',
  SILVER_CERTIFICATE: 'Silver Certificate',
  OTHER: 'Other',
};

export const OWNER_ENTITY_LABELS: Record<OwnerEntity, string> = {
  PERSONAL_TRUST: 'Personal Trust',
  BUSINESS_TRUST: 'Business Trust',
  SPV_LLC: 'SPV LLC',
};

export const TOKEN_MODEL_LABELS: Record<TokenModel, string> = {
  ONE_TO_ONE: '1:1 Token',
  FRACTIONAL: 'Fractional',
  VAULT_BASKET: 'Vault Basket',
};

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  GOLDBACK: 'badge-gold',
  SILVER: 'badge-silver',
  COPPER: 'badge-copper',
  GOLD_CERTIFICATE: 'badge-gold',
  SILVER_CERTIFICATE: 'badge-silver',
  OTHER: 'bg-muted text-muted-foreground',
};
