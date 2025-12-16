// 0x Swap API v2 Client Helper
// Used for EVM DEX price fetching and swap quotes
// NOTE: 0x API v2 uses a single base URL with chainId parameter

// 0x API v2 base URL (same for all chains)
const ZEROX_API_BASE_URL = "https://api.0x.org";

// Chain IDs for 0x API
const CHAIN_IDS: Record<string, number> = {
  // Mainnets
  POLYGON: 137,
  ETHEREUM: 1,
  ARBITRUM: 42161,
  BSC: 56,
  // Testnets
  POLYGON_AMOY: 80002,
  SEPOLIA: 11155111,
  ARBITRUM_SEPOLIA: 421614,
  BSC_TESTNET: 97,
};

// Network display names
export const NETWORK_NAMES: Record<string, string> = {
  POLYGON: "Polygon (Mainnet)",
  ETHEREUM: "Ethereum (Mainnet)",
  ARBITRUM: "Arbitrum (Mainnet)",
  BSC: "BNB Chain (Mainnet)",
  POLYGON_AMOY: "Polygon Amoy (Testnet)",
  SEPOLIA: "Ethereum Sepolia (Testnet)",
  ARBITRUM_SEPOLIA: "Arbitrum Sepolia (Testnet)",
  BSC_TESTNET: "BNB Chain Testnet",
};

// Canonical Polygon Mainnet token addresses
export const POLYGON_CANONICAL_TOKENS: Record<string, { address: string; decimals: number; name: string }> = {
  WMATIC: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18, name: "Wrapped MATIC" },
  POL: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18, name: "POL (WMATIC)" },
  USDC: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6, name: "USDC.e (Bridged)" },
  USDC_NATIVE: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, name: "USDC (Native)" },
  USDT: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6, name: "USDT" },
  WETH: { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18, name: "Wrapped ETH" },
  DAI: { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, name: "DAI" },
};

// USDC variants on Polygon (for warning detection)
export const POLYGON_USDC_VARIANTS: Record<string, string> = {
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": "USDC.e (Bridged) - Primary",
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": "USDC (Native Circle)",
};

// Check if network is a testnet
export function isTestnet(network: string): boolean {
  const testnets = ["POLYGON_AMOY", "SEPOLIA", "ARBITRUM_SEPOLIA", "BSC_TESTNET"];
  return testnets.includes(network.toUpperCase());
}

export interface ZeroXQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  price: string;
  guaranteedPrice?: string;
  to?: string;
  data?: string;
  gas: string;
  gasPrice?: string;
  estimatedGas: string;
  sources: string[];
  allowanceTarget?: string;
}

export interface ZeroXQuoteParams {
  network: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress?: string;
  includedSources?: string[];
  excludedSources?: string[];
  slippageBps?: number;
}

export interface ZeroXQuoteResult {
  quote: ZeroXQuote | null;
  error: string | null;
  errorCode: number | null;
  rawResponse?: string;
  requestParams?: Record<string, string>;
  retryAttempts?: number;
  usedRelaxedConstraints?: boolean;
}

// Supported liquidity sources for 0x on Polygon
export const POLYGON_LIQUIDITY_SOURCES = [
  "Uniswap_V3",
  "QuickSwap",
  "QuickSwap_V3", 
  "SushiSwap",
  "Curve",
  "Balancer_V2",
  "DODO_V2",
  "KyberSwap_Elastic",
  "Aave_V3",
] as const;

export type PolygonLiquiditySource = typeof POLYGON_LIQUIDITY_SOURCES[number];

export class ZeroXApiError extends Error {
  public statusCode: number;
  public reason: string;
  public requestParams?: Record<string, string>;

  constructor(message: string, statusCode: number, reason: string, requestParams?: Record<string, string>) {
    super(message);
    this.name = "ZeroXApiError";
    this.statusCode = statusCode;
    this.reason = reason;
    this.requestParams = requestParams;
  }
}

// Minimum dust threshold (in base units) - below this, abort
export const MIN_DUST_THRESHOLD = BigInt(1000); // 1000 base units

/**
 * Validate token address against canonical Polygon tokens
 * Returns warning message if non-canonical address detected
 */
export function validatePolygonTokenAddress(address: string, expectedSymbol?: string): string | null {
  const normalizedAddress = address.toLowerCase();
  
  // Check if it's a known USDC variant
  for (const [variantAddress, description] of Object.entries(POLYGON_USDC_VARIANTS)) {
    if (normalizedAddress === variantAddress.toLowerCase()) {
      if (expectedSymbol?.toUpperCase() === 'USDC' && variantAddress !== POLYGON_CANONICAL_TOKENS.USDC.address) {
        return `Using non-primary USDC variant: ${description}`;
      }
      return null; // Known variant, no warning
    }
  }
  
  // Check canonical tokens
  for (const [symbol, info] of Object.entries(POLYGON_CANONICAL_TOKENS)) {
    if (normalizedAddress === info.address.toLowerCase()) {
      return null; // Canonical address, no warning
    }
  }
  
  return null; // Unknown token, no warning (could be any ERC20)
}

/**
 * Get expected decimals for a token address on Polygon
 */
export function getPolygonTokenDecimals(address: string): number | null {
  const normalizedAddress = address.toLowerCase();
  
  for (const [, info] of Object.entries(POLYGON_CANONICAL_TOKENS)) {
    if (normalizedAddress === info.address.toLowerCase()) {
      return info.decimals;
    }
  }
  
  return null; // Unknown token
}

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get a swap quote from 0x API v2 with retry logic and improved error handling
 * Returns detailed result object including error information
 */
export async function getZeroXQuoteWithDetails(params: ZeroXQuoteParams): Promise<ZeroXQuoteResult> {
  const { network, sellToken, buyToken, sellAmount, takerAddress, includedSources, excludedSources, slippageBps } = params;
  const normalizedNetwork = network.toUpperCase();

  const chainId = CHAIN_IDS[normalizedNetwork];
  if (!chainId) {
    return {
      quote: null,
      error: `Unsupported network: ${normalizedNetwork}`,
      errorCode: 400,
    };
  }

  const apiKey = Deno.env.get("ZEROX_API_KEY");
  if (!apiKey) {
    return {
      quote: null,
      error: "ZEROX_API_KEY is required for 0x API v2",
      errorCode: 500,
    };
  }

  // Validate sellAmount - abort if zero or below dust threshold
  const sellAmountBigInt = BigInt(sellAmount);
  if (sellAmountBigInt <= BigInt(0)) {
    return {
      quote: null,
      error: `Invalid sellAmount: ${sellAmount} (must be > 0)`,
      errorCode: 400,
    };
  }
  if (sellAmountBigInt < MIN_DUST_THRESHOLD) {
    return {
      quote: null,
      error: `sellAmount ${sellAmount} below dust threshold ${MIN_DUST_THRESHOLD}`,
      errorCode: 400,
    };
  }

  // Build request params for logging
  const requestParams: Record<string, string> = {
    sellToken,
    buyToken,
    sellAmount,
    chainId: chainId.toString(),
  };
  if (takerAddress) requestParams.taker = takerAddress;
  if (includedSources?.length) requestParams.includedSources = includedSources.join(",");
  if (excludedSources?.length) requestParams.excludedSources = excludedSources.join(",");
  if (slippageBps) requestParams.slippageBps = slippageBps.toString();

  const RETRY_DELAYS = [0, 250, 750]; // First attempt immediate, then 250ms, then 750ms
  let lastError: string | null = null;
  let lastErrorCode: number | null = null;
  let lastRawResponse: string | undefined;
  let retryAttempts = 0;

  // Try with source constraints first, then relax if needed
  const attemptConfigs = [
    { includedSources, excludedSources, relaxed: false },
  ];
  
  // Add relaxed retry config if source constraints were specified
  if (includedSources?.length || excludedSources?.length) {
    attemptConfigs.push({ includedSources: undefined, excludedSources: undefined, relaxed: true });
  }

  for (const config of attemptConfigs) {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (attempt > 0 || config.relaxed) {
        const delay = config.relaxed && attempt === 0 ? 250 : RETRY_DELAYS[attempt];
        await sleep(delay);
      }
      
      retryAttempts++;

      try {
        const url = new URL(`${ZEROX_API_BASE_URL}/swap/allowance-holder/price`);
        url.searchParams.set("sellToken", sellToken);
        url.searchParams.set("buyToken", buyToken);
        url.searchParams.set("sellAmount", sellAmount);
        url.searchParams.set("chainId", chainId.toString());
        
        if (takerAddress) {
          url.searchParams.set("taker", takerAddress);
        }
        if (slippageBps) {
          url.searchParams.set("slippageBps", slippageBps.toString());
        }

        // Apply source constraints (or relaxed)
        if (!config.relaxed) {
          if (config.includedSources?.length) {
            url.searchParams.set("includedSources", config.includedSources.join(","));
          }
          if (config.excludedSources?.length) {
            url.searchParams.set("excludedSources", config.excludedSources.join(","));
          }
        }

        const constraintInfo = config.relaxed 
          ? " [RELAXED - no source constraints]" 
          : (config.includedSources?.length ? ` [sources: ${config.includedSources.join(",")}]` : "");
        
        console.log(`[zerox-client] Attempt ${retryAttempts}: ${sellToken} -> ${buyToken} on ${normalizedNetwork} (chainId: ${chainId})${constraintInfo}`);
        console.log(`[zerox-client] Request params: ${JSON.stringify(requestParams)}`);

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "0x-api-key": apiKey,
          "0x-version": "v2",
        };

        const response = await fetch(url.toString(), { headers });

        if (!response.ok) {
          const errorText = await response.text();
          // Redact API key from logs
          const redactedError = errorText.substring(0, 500).replace(/0x-api-key[^&]*/gi, "0x-api-key=REDACTED");
          
          console.error(`[zerox-client] API error (${response.status}): ${redactedError}`);
          console.error(`[zerox-client] Failed request params: sellToken=${sellToken}, buyToken=${buyToken}, sellAmount=${sellAmount}, chainId=${chainId}`);
          
          lastError = `0x API error ${response.status}: ${redactedError}`;
          lastErrorCode = response.status;
          lastRawResponse = redactedError;
          
          // Don't retry on 400 (bad params) or 404 (no liquidity)
          if (response.status === 400 || response.status === 404) {
            // Try relaxed constraints if this was a constrained request
            if (!config.relaxed && (includedSources?.length || excludedSources?.length)) {
              console.log(`[zerox-client] Trying relaxed constraints after ${response.status} error...`);
              break; // Break inner retry loop, try relaxed config
            }
            return {
              quote: null,
              error: lastError,
              errorCode: lastErrorCode,
              rawResponse: lastRawResponse,
              requestParams,
              retryAttempts,
              usedRelaxedConstraints: config.relaxed,
            };
          }
          
          // Retry on server errors (5xx)
          if (response.status >= 500) {
            continue;
          }
          
          // For other errors, try relaxed if available
          break;
        }

        const data = await response.json();
        console.log(`[zerox-client] Quote received: buyAmount=${data.buyAmount}${config.relaxed ? " (relaxed constraints)" : ""}`);

        return {
          quote: {
            sellToken: data.sellToken || sellToken,
            buyToken: data.buyToken || buyToken,
            sellAmount: data.sellAmount || sellAmount,
            buyAmount: data.buyAmount,
            price: data.price || "0",
            guaranteedPrice: data.guaranteedPrice,
            to: data.to,
            data: data.data,
            gas: data.gas || data.transaction?.gas || "0",
            gasPrice: data.gasPrice || data.transaction?.gasPrice,
            estimatedGas: data.estimatedGas || data.gas || "0",
            sources: data.sources?.map((s: { name: string }) => s.name) || [],
            allowanceTarget: data.allowanceTarget,
          },
          error: null,
          errorCode: null,
          requestParams,
          retryAttempts,
          usedRelaxedConstraints: config.relaxed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        lastErrorCode = 0;
        console.error(`[zerox-client] Unexpected error on attempt ${retryAttempts}:`, lastError);
      }
    }
  }

  return {
    quote: null,
    error: lastError || "Failed after all retry attempts",
    errorCode: lastErrorCode,
    rawResponse: lastRawResponse,
    requestParams,
    retryAttempts,
  };
}

/**
 * Get a swap quote from 0x API v2 (backwards compatible wrapper)
 * Returns null if quote fails (no liquidity, etc.)
 */
export async function getZeroXQuote(params: ZeroXQuoteParams): Promise<ZeroXQuote | null> {
  const result = await getZeroXQuoteWithDetails(params);
  return result.quote;
}

/**
 * Calculate round-trip arbitrage profit in wei
 */
export function calculateArbitrageProfit(
  inputAmount: string,
  outputAmount: string
): bigint {
  const input = BigInt(inputAmount);
  const output = BigInt(outputAmount);
  return output - input;
}

/**
 * Check if a network is supported by 0x
 */
export function isSupportedZeroXNetwork(network: string): boolean {
  return network.toUpperCase() in CHAIN_IDS;
}

/**
 * Get list of supported networks
 */
export function getSupportedZeroXNetworks(): string[] {
  return Object.keys(CHAIN_IDS);
}

/**
 * Validate EVM address format
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Format amount with proper decimals for logging
 */
export function formatAmountWithDecimals(amount: string | bigint, decimals: number): string {
  const amountBigInt = typeof amount === 'string' ? BigInt(amount) : amount;
  const divisor = BigInt(10 ** decimals);
  const whole = amountBigInt / divisor;
  const fraction = amountBigInt % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0');
  return `${whole}.${fractionStr.slice(0, 6)}`;
}
