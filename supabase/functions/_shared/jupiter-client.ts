/**
 * Jupiter DEX Aggregator Client for Solana
 * 
 * This module provides functions to interact with Jupiter's v6 API for:
 * - Fetching swap quotes
 * - Building swap transactions
 * 
 * INTERNAL USE ONLY: This is for internal arbitrage operations via OPS_WALLET.
 * Do NOT expose these functions to frontend or public APIs.
 */

// Jupiter API v6 base URL
// TODO: Jupiter uses the same API for mainnet and devnet - token mints determine the network
const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';

/**
 * Jupiter quote response structure
 */
export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

/**
 * Jupiter swap response structure
 */
export interface JupiterSwapResponse {
  swapTransaction: string; // Base64 encoded transaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

/**
 * Error type for Jupiter API failures
 */
export class JupiterApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public apiError?: unknown
  ) {
    super(message);
    this.name = 'JupiterApiError';
  }
}

/**
 * Fetch a swap quote from Jupiter
 * 
 * @param inputMint - Token mint address to swap FROM
 * @param outputMint - Token mint address to swap TO
 * @param amount - Amount in base units (lamports for SOL, smallest unit for SPL)
 * @param slippageBps - Slippage tolerance in basis points (100 = 1%)
 * @returns Quote response or null if no route found
 */
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: bigint,
  slippageBps: number = 100
): Promise<JupiterQuoteResponse | null> {
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
      swapMode: 'ExactIn',
      onlyDirectRoutes: 'true', // TODO: Set to false for production to get better routes
      // TODO: Consider adding maxAccounts param to limit complexity
    });

    const url = `${JUPITER_API_BASE}/quote?${params.toString()}`;
    console.log('[jupiter-client] Fetching quote:', url);

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[jupiter-client] Quote API error:', response.status, errorText);
      
      // 400 often means no route found
      if (response.status === 400) {
        console.log('[jupiter-client] No route found for this pair');
        return null;
      }
      
      throw new JupiterApiError(
        `Jupiter quote API failed: ${response.status}`,
        response.status,
        errorText
      );
    }

    const quote: JupiterQuoteResponse = await response.json();
    console.log('[jupiter-client] Quote received:', {
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
      routeSteps: quote.routePlan?.length || 0,
    });

    return quote;
  } catch (error) {
    if (error instanceof JupiterApiError) {
      throw error;
    }
    console.error('[jupiter-client] Unexpected error fetching quote:', error);
    throw new JupiterApiError(
      `Failed to fetch Jupiter quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      error
    );
  }
}

/**
 * Get a serialized swap transaction from Jupiter
 * 
 * @param quoteResponse - The quote response from getJupiterQuote
 * @param userPublicKey - The public key that will sign and execute the swap (OPS_WALLET for internal arb)
 * @param wrapUnwrapSOL - Whether to automatically wrap/unwrap SOL (default: true)
 * @returns Swap response with base64-encoded transaction or null on failure
 */
export async function getJupiterSwapTransaction(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: string,
  wrapUnwrapSOL: boolean = true
): Promise<JupiterSwapResponse | null> {
  try {
    const url = `${JUPITER_API_BASE}/swap`;
    
    const requestBody = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: wrapUnwrapSOL,
      // TODO: Consider adding these for production:
      // dynamicComputeUnitLimit: true,
      // prioritizationFeeLamports: 'auto',
    };

    console.log('[jupiter-client] Requesting swap transaction for user:', userPublicKey);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[jupiter-client] Swap API error:', response.status, errorText);
      throw new JupiterApiError(
        `Jupiter swap API failed: ${response.status}`,
        response.status,
        errorText
      );
    }

    const swapResponse: JupiterSwapResponse = await response.json();
    console.log('[jupiter-client] Swap transaction received:', {
      lastValidBlockHeight: swapResponse.lastValidBlockHeight,
      prioritizationFee: swapResponse.prioritizationFeeLamports,
      txLength: swapResponse.swapTransaction?.length || 0,
    });

    return swapResponse;
  } catch (error) {
    if (error instanceof JupiterApiError) {
      throw error;
    }
    console.error('[jupiter-client] Unexpected error getting swap transaction:', error);
    throw new JupiterApiError(
      `Failed to get Jupiter swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      error
    );
  }
}

/**
 * Helper to calculate profit from a round-trip arbitrage
 * 
 * @param initialAmount - Starting amount in base units
 * @param quote1 - Quote for first leg (A -> B)
 * @param quote2 - Quote for second leg (B -> A)
 * @returns Profit in base units of the initial token (can be negative)
 */
export function calculateArbitrageProfit(
  initialAmount: bigint,
  quote1: JupiterQuoteResponse,
  quote2: JupiterQuoteResponse
): bigint {
  const finalAmount = BigInt(quote2.outAmount);
  return finalAmount - initialAmount;
}

/**
 * Validate if a Solana address is valid base58 format
 * Basic validation - does not check if account exists on-chain
 */
export function isValidSolanaAddress(address: string): boolean {
  // Base58 characters (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Common Solana token mints for reference
 * TODO: Add more as needed for arbitrage strategies
 */
export const COMMON_MINTS = {
  // Native SOL wrapped
  WSOL: 'So11111111111111111111111111111111111111112',
  // USDC (mainnet) - different on devnet
  USDC_MAINNET: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // USDT (mainnet) - different on devnet  
  USDT_MAINNET: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  // TODO: Add devnet test token mints if needed
} as const;
