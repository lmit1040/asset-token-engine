export interface AutoDetectionResult {
  itemId: string;
  isComplete: boolean;
  reason: string;
  detectedValue?: string | number;
}

export interface LaunchStatusResponse {
  success: boolean;
  results: AutoDetectionResult[];
  checkedAt: string;
  error?: string;
}

export type DetectionStatus = 'auto-verified' | 'auto-incomplete' | 'manual-required' | 'loading';

// Items that can be auto-detected
export const AUTO_DETECTABLE_ITEMS = [
  // Environment & Secrets
  'new-fee-payer-encryption-key',
  'new-ops-wallet-keys',
  'verify-resend-api-production',
  'verify-pinata-production',
  'mainnet-0x-api',
  'mainnet-rpc-solana',
  // Wallet Funding
  'generate-mainnet-solana-fee-payers',
  'generate-mainnet-evm-fee-payers',
  'verify-refill-thresholds',
  // Arbitrage & Flash Loans
  'remove-mock-mode',
  'update-flash-loan-providers',
  'configure-safe-mode-mainnet',
  'update-strategy-thresholds',
  // Security
  'activity-logging',
  'rate-limiting',
  // Token & Treasury
  'redeploy-mxu-mainnet',
  'redeploy-asset-tokens-mainnet',
  'update-token-definitions',
  // Testing (indicator only)
  'e2e-auth-testing',
];
