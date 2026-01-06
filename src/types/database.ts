export type AssetType = 'GOLDBACK' | 'SILVER' | 'COPPER' | 'GOLD_CERTIFICATE' | 'SILVER_CERTIFICATE' | 'OTHER';
export type OwnerEntity = 'PERSONAL_TRUST' | 'BUSINESS_TRUST' | 'SPV_LLC';
export type TokenModel = 'ONE_TO_ONE' | 'FRACTIONAL' | 'VAULT_BASKET';
export type AppRole = 'admin' | 'asset_manager' | 'standard_user';

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrator',
  asset_manager: 'Asset Manager',
  standard_user: 'Standard User',
};
export type BlockchainChain = 'ETHEREUM' | 'POLYGON' | 'BSC' | 'SOLANA' | 'NONE';
export type NetworkType = 'MAINNET' | 'TESTNET' | 'NONE';
export type DeploymentStatus = 'NOT_DEPLOYED' | 'PENDING' | 'DEPLOYED';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  evm_wallet_address: string | null;
  solana_wallet_address: string | null;
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
  submitted_by_profile?: {
    name: string | null;
    email: string | null;
  } | null;
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
  title: string | null;
  description: string | null;
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
  chain: BlockchainChain;
  network: NetworkType;
  contract_address: string | null;
  treasury_account: string | null;
  deployment_status: DeploymentStatus;
  token_image_url: string | null;
  asset?: Asset;
}

export interface UserTokenHolding {
  id: string;
  user_id: string;
  token_definition_id: string;
  balance: number;
  assigned_by: string | null;
  assigned_at: string;
  delivery_wallet_address: string | null;
  delivery_wallet_type: 'EVM' | 'SOLANA' | null;
  token_definition?: TokenDefinition;
}

export interface ActivityLog {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
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

export const BLOCKCHAIN_CHAIN_LABELS: Record<BlockchainChain, string> = {
  ETHEREUM: 'Ethereum',
  POLYGON: 'Polygon',
  BSC: 'BNB Smart Chain',
  SOLANA: 'Solana',
  NONE: 'Not Selected',
};

export const NETWORK_TYPE_LABELS: Record<NetworkType, string> = {
  MAINNET: 'Mainnet',
  TESTNET: 'Testnet',
  NONE: 'Not Selected',
};

export const DEPLOYMENT_STATUS_LABELS: Record<DeploymentStatus, string> = {
  NOT_DEPLOYED: 'Not Deployed',
  PENDING: 'Pending',
  DEPLOYED: 'Deployed',
};

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  GOLDBACK: 'badge-gold',
  SILVER: 'badge-silver',
  COPPER: 'badge-copper',
  GOLD_CERTIFICATE: 'badge-gold',
  SILVER_CERTIFICATE: 'badge-silver',
  OTHER: 'bg-muted text-muted-foreground',
};

// Hardcoded example prices for MVP (USD per unit)
export const ASSET_PRICES: Record<AssetType, number> = {
  GOLDBACK: 4.25,
  SILVER: 29.50,
  COPPER: 4.10,
  GOLD_CERTIFICATE: 2500,
  SILVER_CERTIFICATE: 150,
  OTHER: 100,
};
