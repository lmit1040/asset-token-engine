/**
 * Jupiter DEX Aggregator Client for Solana
 * 
 * This module provides functions to interact with Jupiter's v6 API for:
 * - Fetching swap quotes
 * - Building swap transactions
 * 
 * Includes MOCK MODE for testing when Jupiter API is unavailable (DNS issues in edge functions)
 * 
 * INTERNAL USE ONLY: This is for internal arbitrage operations via OPS_WALLET.
 * Do NOT expose these functions to frontend or public APIs.
 */

// Jupiter API v6 base URL
// TODO: Jupiter uses the same API for mainnet and devnet - token mints determine the network
const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';

// Mock mode flag - set to true to use simulated prices when Jupiter API is unavailable
let MOCK_MODE_ENABLED = false;

/**
 * Enable or disable mock mode for testing
 */
export function setMockMode(enabled: boolean): void {
  MOCK_MODE_ENABLED = enabled;
  console.log(`[jupiter-client] Mock mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Check if mock mode is currently enabled
 */
export function isMockModeEnabled(): boolean {
  return MOCK_MODE_ENABLED;
}

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
  isMock?: boolean; // Flag to indicate this is mock data
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
 * Jupiter swap instructions response structure
 * Used for building atomic multi-swap transactions
 */
export interface JupiterSwapInstructionsResponse {
  tokenLedgerInstruction: SerializedInstruction | null;
  computeBudgetInstructions: SerializedInstruction[];
  setupInstructions: SerializedInstruction[];
  swapInstruction: SerializedInstruction;
  cleanupInstruction: SerializedInstruction | null;
  addressLookupTableAddresses: string[];
}

/**
 * Serialized instruction from Jupiter API
 */
export interface SerializedInstruction {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string; // Base64 encoded
}

/**
 * Error type for Jupiter API failures
 */
export class JupiterApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public apiError?: unknown,
    public isDnsError?: boolean
  ) {
    super(message);
    this.name = 'JupiterApiError';
  }
}

/**
 * Generate a mock quote for testing purposes
 * Simulates realistic price behavior with small random variations
 */
function generateMockQuote(
  inputMint: string,
  outputMint: string,
  amount: bigint,
  slippageBps: number
): JupiterQuoteResponse {
  // Simulate a 0.1% to 0.5% spread/fee on the swap
  const spreadMultiplier = 0.995 + (Math.random() * 0.004); // 99.5% to 99.9%
  const outAmount = BigInt(Math.floor(Number(amount) * spreadMultiplier));
  
  console.log(`[jupiter-client] MOCK: Generated quote ${amount} -> ${outAmount} (${(spreadMultiplier * 100).toFixed(2)}%)`);
  
  return {
    inputMint,
    inAmount: amount.toString(),
    outputMint,
    outAmount: outAmount.toString(),
    otherAmountThreshold: outAmount.toString(),
    swapMode: 'ExactIn',
    slippageBps,
    platformFee: null,
    priceImpactPct: (Math.random() * 0.1).toFixed(4), // 0-0.1%
    routePlan: [{
      swapInfo: {
        ammKey: 'MockAMM' + Math.random().toString(36).substring(7),
        label: 'Mock DEX',
        inputMint,
        outputMint,
        inAmount: amount.toString(),
        outAmount: outAmount.toString(),
        feeAmount: Math.floor(Number(amount) * 0.003).toString(), // 0.3% fee
        feeMint: inputMint,
      },
      percent: 100,
    }],
    contextSlot: Date.now(),
    timeTaken: Math.random() * 100,
    isMock: true,
  };
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
  slippageBps: number = 100,
  useMockOnFailure: boolean = true
): Promise<JupiterQuoteResponse | null> {
  // If mock mode is explicitly enabled, return mock data immediately
  if (MOCK_MODE_ENABLED) {
    console.log('[jupiter-client] Mock mode enabled, generating mock quote');
    return generateMockQuote(inputMint, outputMint, amount, slippageBps);
  }

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
    // Check for DNS resolution errors (common in edge functions)
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isDnsError = errorMessage.includes('failed to lookup address') || 
                       errorMessage.includes('dns error') ||
                       errorMessage.includes('getaddrinfo');
    
    if (isDnsError && useMockOnFailure) {
      console.warn('[jupiter-client] DNS resolution failed, falling back to mock mode');
      console.warn('[jupiter-client] Original error:', errorMessage);
      return generateMockQuote(inputMint, outputMint, amount, slippageBps);
    }

    if (error instanceof JupiterApiError) {
      throw error;
    }
    console.error('[jupiter-client] Unexpected error fetching quote:', error);
    throw new JupiterApiError(
      `Failed to fetch Jupiter quote: ${errorMessage}`,
      undefined,
      error,
      isDnsError
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
 * Get swap instructions from Jupiter (for building atomic multi-swap transactions)
 * 
 * @param quoteResponse - The quote response from getJupiterQuote
 * @param userPublicKey - The public key that will sign and execute the swap
 * @param wrapUnwrapSOL - Whether to automatically wrap/unwrap SOL (default: true)
 * @returns Swap instructions response or null on failure
 */
export async function getJupiterSwapInstructions(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: string,
  wrapUnwrapSOL: boolean = true
): Promise<JupiterSwapInstructionsResponse | null> {
  try {
    const url = `${JUPITER_API_BASE}/swap-instructions`;
    
    const requestBody = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: wrapUnwrapSOL,
      // TODO: Consider adding for production:
      // dynamicComputeUnitLimit: true,
      // prioritizationFeeLamports: 'auto',
    };

    console.log('[jupiter-client] Requesting swap instructions for user:', userPublicKey);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[jupiter-client] Swap instructions API error:', response.status, errorText);
      throw new JupiterApiError(
        `Jupiter swap-instructions API failed: ${response.status}`,
        response.status,
        errorText
      );
    }

    const instructionsResponse: JupiterSwapInstructionsResponse = await response.json();
    console.log('[jupiter-client] Swap instructions received:', {
      setupCount: instructionsResponse.setupInstructions?.length || 0,
      hasSwap: !!instructionsResponse.swapInstruction,
      hasCleanup: !!instructionsResponse.cleanupInstruction,
      lookupTables: instructionsResponse.addressLookupTableAddresses?.length || 0,
    });

    return instructionsResponse;
  } catch (error) {
    if (error instanceof JupiterApiError) {
      throw error;
    }
    console.error('[jupiter-client] Unexpected error getting swap instructions:', error);
    throw new JupiterApiError(
      `Failed to get Jupiter swap instructions: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
