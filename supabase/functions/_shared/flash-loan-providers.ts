/**
 * Flash Loan Provider Configurations and Helpers
 * Supports Aave V3 (EVM) and Balancer (EVM) flash loans
 */

// Aave V3 Pool ABI (flash loan functions only)
export const AAVE_V3_POOL_ABI = [
  "function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external",
  "function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128)",
  "function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
];

// Balancer Vault ABI (flash loan functions only) 
export const BALANCER_VAULT_ABI = [
  "function flashLoan(address recipient, address[] memory tokens, uint256[] memory amounts, bytes memory userData) external",
];

// MetallumFlashReceiver ABI (our deployed contract for atomic execution)
export const METALLUM_FLASH_RECEIVER_ABI = [
  "function executeArbitrage(address asset, uint256 amount, address router, bytes calldata swapData) external",
  "function whitelistRouter(address router, bool status) external",
  "function owner() external view returns (address)",
  "function whitelistedRouters(address) external view returns (bool)",
  "function withdrawProfit(address token, uint256 amount) external",
  "function withdrawAllProfit(address token) external",
  "function getContractBalance(address token) external view returns (uint256)",
];

// ERC20 ABI for token interactions
export const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

// Provider addresses per network
export const FLASH_LOAN_CONTRACTS: Record<string, Record<string, string>> = {
  // Aave V3 Pool addresses
  AAVE_V3: {
    POLYGON: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    ETHEREUM: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    ARBITRUM: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    BSC: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB", // Aave V3 BSC
  },
  // Balancer Vault (same address on all networks)
  BALANCER: {
    POLYGON: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    ETHEREUM: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    ARBITRUM: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    BSC: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },
};

// Common token addresses per network for flash loans
export const FLASH_LOAN_TOKENS: Record<string, Record<string, string>> = {
  POLYGON: {
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  },
  ETHEREUM: {
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI: "0x6B175474E89094C44Da98b954EesdfFCD0E",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  ARBITRUM: {
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  BSC: {
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    DAI: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  },
};

// Flash loan fee in basis points by provider
export const FLASH_LOAN_FEES_BPS: Record<string, number> = {
  AAVE_V3: 5, // 0.05% (5 bps) - Aave V3 reduced fee
  BALANCER: 0, // 0% - Balancer has no flash loan fee
};

export interface FlashLoanProvider {
  id: string;
  name: string;
  displayName: string;
  chain: string;
  contractAddress: string;
  receiverContractAddress?: string;
  poolAddress?: string;
  feeBps: number;
  supportedTokens: string[];
  isActive: boolean;
}

export interface FlashLoanParams {
  provider: string;
  network: string;
  borrowToken: string;
  borrowAmount: string;
  executorAddress: string;
  receiverContractAddress?: string;
  arbitrageParams: {
    tokenA: string;
    tokenB: string;
    dexRouter: string;
    swapData: string;
  };
}

export interface FlashLoanResult {
  success: boolean;
  txHash?: string;
  borrowedAmount: string;
  feePaid: string;
  profit: string;
  error?: string;
  isAtomic?: boolean;
}

/**
 * Get flash loan contract address for a provider and network
 */
export function getFlashLoanContract(provider: string, network: string): string | null {
  const normalizedProvider = provider.toUpperCase().replace('_POLYGON', '').replace('_ETHEREUM', '').replace('_ARBITRUM', '').replace('_BSC', '');
  const normalizedNetwork = network.toUpperCase();
  
  // Extract base provider name (AAVE_V3_POLYGON -> AAVE_V3)
  const baseProvider = normalizedProvider.split('_').slice(0, 2).join('_');
  
  return FLASH_LOAN_CONTRACTS[baseProvider]?.[normalizedNetwork] || null;
}

/**
 * Get token address for a symbol on a network
 */
export function getTokenAddress(network: string, symbol: string): string | null {
  return FLASH_LOAN_TOKENS[network.toUpperCase()]?.[symbol.toUpperCase()] || null;
}

/**
 * Calculate flash loan fee
 */
export function calculateFlashLoanFee(provider: string, amount: bigint): bigint {
  const baseProvider = provider.toUpperCase().split('_')[0] + '_V3';
  const feeBps = FLASH_LOAN_FEES_BPS[baseProvider] || FLASH_LOAN_FEES_BPS.AAVE_V3;
  return (amount * BigInt(feeBps)) / 10000n;
}

/**
 * Check if a provider supports a network
 */
export function isProviderSupportedOnNetwork(provider: string, network: string): boolean {
  return !!getFlashLoanContract(provider, network);
}

/**
 * Get all supported providers for a network
 */
export function getSupportedProviders(network: string): string[] {
  const normalizedNetwork = network.toUpperCase();
  const providers: string[] = [];
  
  for (const [providerName, networks] of Object.entries(FLASH_LOAN_CONTRACTS)) {
    if (networks[normalizedNetwork]) {
      providers.push(providerName);
    }
  }
  
  return providers;
}

/**
 * Encode swap data for the receiver contract
 * The receiver contract expects: router address + encoded swap call
 */
export function encodeReceiverParams(
  router: string,
  swapData: string,
): string {
  // Simple concatenation for the receiver contract
  // The contract will decode (address router, bytes swapData) from params
  return router.toLowerCase() + swapData.slice(2); // Remove 0x from swapData
}
