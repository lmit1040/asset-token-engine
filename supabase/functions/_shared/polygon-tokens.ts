// Polygon Mainnet Token Configuration for OPS Refill Arbitrage
// All addresses are checksum-validated Polygon mainnet addresses

export const POLYGON_TOKENS = {
  // USDC - USD Coin (PoS) - 6 decimals
  USDC: {
    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Native USDC on Polygon
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
  },
  // USDC.e - Bridged USDC (more liquidity)
  USDC_E: {
    address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Bridged USDC.e
    decimals: 6,
    symbol: 'USDC.e',
    name: 'Bridged USD Coin',
  },
  // WETH - Wrapped Ether - 18 decimals
  WETH: {
    address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether',
  },
  // WMATIC - Wrapped MATIC (gas token) - 18 decimals
  WMATIC: {
    address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    decimals: 18,
    symbol: 'WMATIC',
    name: 'Wrapped Matic',
  },
  // POL native token placeholder (for native balance)
  POL: {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native token sentinel
    decimals: 18,
    symbol: 'POL',
    name: 'Polygon',
  },
} as const;

// Default configuration for OPS refill cycle
export const OPS_REFILL_CONFIG = {
  // Default notional in USDC (6 decimals) = 1000 USDC
  DEFAULT_NOTIONAL_USDC: 1000n * 10n ** 6n,
  // Maximum notional in USDC (6 decimals) = 50000 USDC  
  MAX_NOTIONAL_USDC: 50000n * 10n ** 6n,
  // Default slippage in basis points
  DEFAULT_SLIPPAGE_BPS: 30,
  // Minimum net profit threshold in USDC base units (e.g., 1 USDC = 1000000)
  MIN_NET_PROFIT_USDC: 100000n, // 0.1 USDC
  // Minimum profit in basis points
  MIN_PROFIT_BPS: 5,
  // Chain ID for Polygon mainnet
  CHAIN_ID: 137,
  // Network identifier
  NETWORK: 'POLYGON',
};

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

// Validate token decimals match expected
export function validateTokenDecimals(
  tokenSymbol: keyof typeof POLYGON_TOKENS,
  amount: bigint,
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
