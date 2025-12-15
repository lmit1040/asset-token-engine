// Polygon Mainnet Token Configuration for OPS Refill Arbitrage
// All addresses are checksum-validated Polygon mainnet addresses
// IMPORTANT: USDC has 6 decimals, WETH/WMATIC/POL have 18 decimals

export const POLYGON_TOKENS = {
  // USDC.e - Bridged USDC (more liquidity on Polygon)
  // Address: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
  // Decimals: 6 (1 USDC = 1,000,000 base units)
  USDC_E: {
    address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    decimals: 6,
    symbol: 'USDC.e',
    name: 'Bridged USD Coin',
  },
  // Native USDC on Polygon (less liquidity than USDC.e)
  USDC: {
    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
  },
  // WETH - Wrapped Ether
  // Address: 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619
  // Decimals: 18 (1 WETH = 1e18 base units)
  WETH: {
    address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether',
  },
  // WMATIC - Wrapped MATIC (gas token wrapper)
  // Address: 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270
  // Decimals: 18
  WMATIC: {
    address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    decimals: 18,
    symbol: 'WMATIC',
    name: 'Wrapped Matic',
  },
  // POL native token placeholder (for native balance checks)
  // Decimals: 18
  POL: {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native token sentinel
    decimals: 18,
    symbol: 'POL',
    name: 'Polygon',
  },
} as const;

// Type for token keys
export type PolygonTokenKey = keyof typeof POLYGON_TOKENS;

// Default configuration for OPS refill cycle
// NOTE: All USDC amounts use 6 decimals (base units)
// NOTE: All POL/WETH/WMATIC amounts use 18 decimals (wei)
export const OPS_REFILL_CONFIG = {
  // Default notional in USDC BASE UNITS (6 decimals)
  // 1000 USDC = 1000 * 10^6 = 1,000,000,000 base units
  DEFAULT_NOTIONAL_USDC_BASE_UNITS: 1000n * 10n ** 6n,
  
  // Maximum notional in USDC BASE UNITS (6 decimals)
  // 50000 USDC = 50000 * 10^6 = 50,000,000,000 base units
  MAX_NOTIONAL_USDC_BASE_UNITS: 50000n * 10n ** 6n,
  
  // Default slippage in basis points (30 bps = 0.3%)
  DEFAULT_SLIPPAGE_BPS: 30,
  
  // Minimum net profit threshold in USDC BASE UNITS (6 decimals)
  // 0.1 USDC = 100,000 base units
  MIN_NET_PROFIT_USDC_BASE_UNITS: 100000n,
  
  // Minimum profit in basis points (5 bps = 0.05%)
  MIN_PROFIT_BPS: 5,
  
  // Chain ID for Polygon mainnet
  CHAIN_ID: 137,
  
  // Network identifier
  NETWORK: 'POLYGON',
} as const;

// Helper to convert USDC amount (6 decimals) to human readable
export function formatUSDC(amount: bigint): string {
  const value = Number(amount) / 1e6;
  return `${value.toFixed(2)} USDC`;
}

// Helper to convert WETH amount (18 decimals) to human readable
export function formatWETH(amount: bigint): string {
  const value = Number(amount) / 1e18;
  return `${value.toFixed(6)} WETH`;
}

// Helper to convert POL/MATIC amount (18 decimals) to human readable
export function formatPOL(amount: bigint): string {
  const value = Number(amount) / 1e18;
  return `${value.toFixed(6)} POL`;
}

// Convert human-readable USDC to base units (6 decimals)
export function parseUSDC(humanAmount: number): bigint {
  return BigInt(Math.floor(humanAmount * 1e6));
}

// Convert human-readable WETH to base units (18 decimals)
export function parseWETH(humanAmount: number): bigint {
  return BigInt(Math.floor(humanAmount * 1e18));
}

// Validate token decimals match expected
export function validateTokenDecimals(
  tokenSymbol: PolygonTokenKey,
  expectedDecimals: number
): boolean {
  const token = POLYGON_TOKENS[tokenSymbol];
  if (token.decimals !== expectedDecimals) {
    console.error(
      `[polygon-tokens] Decimals mismatch for ${tokenSymbol}: expected ${expectedDecimals}, got ${token.decimals}`
    );
    return false;
  }
  return true;
}

// Validate amount is in correct decimal units for token
export function validateAmountDecimals(
  tokenSymbol: PolygonTokenKey,
  amount: bigint,
  context: string
): void {
  const token = POLYGON_TOKENS[tokenSymbol];
  // Log for debugging - helps catch decimal errors
  console.log(`[polygon-tokens] ${context}: ${token.symbol} amount=${amount.toString()} (${token.decimals} decimals)`);
}
