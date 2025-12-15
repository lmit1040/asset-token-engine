/**
 * Jupiter DEX Aggregator Client for Solana
 * 
 * This module provides functions to interact with Jupiter's v6 API for:
 * - Fetching swap quotes with DEX constraints
 * - Building swap transactions
 * - Calculating net profit after all fees
 * 
 * Includes MOCK MODE for testing when Jupiter API is unavailable (DNS issues in edge functions)
 * 
 * INTERNAL USE ONLY: This is for internal arbitrage operations via OPS_WALLET.
 * Do NOT expose these functions to frontend or public APIs.
 */

// Jupiter API v6 base URL
const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';

// Mock mode flag - set to true to use simulated prices when Jupiter API is unavailable
let MOCK_MODE_ENABLED = false;

// Environment config with defaults
const MIN_NET_PROFIT_LAMPORTS = parseInt(Deno.env.get('MIN_NET_PROFIT_LAMPORTS') || '200000'); // ~0.0002 SOL
const MIN_PROFIT_BPS = parseInt(Deno.env.get('MIN_PROFIT_BPS') || '10'); // 0.10%
const MAX_NOTIONAL_LAMPORTS = BigInt(Deno.env.get('MAX_NOTIONAL_LAMPORTS') || '10000000000'); // 10 SOL default

/**
 * Get minimum net profit threshold in lamports
 */
export function getMinNetProfitLamports(): number {
  return MIN_NET_PROFIT_LAMPORTS;
}

/**
 * Get minimum profit basis points threshold
 */
export function getMinProfitBps(): number {
  return MIN_PROFIT_BPS;
}

/**
 * Get max notional trade size in lamports
 */
export function getMaxNotionalLamports(): bigint {
  return MAX_NOTIONAL_LAMPORTS;
}

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
  prioritizationFeeLamports?: number;
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
  prioritizationFeeLamports?: number;
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
 * Fee breakdown for profit calculation
 */
export interface FeeBreakdown {
  routeFeesLamports: bigint;
  priorityFeeLamports: bigint;
  computeBudgetLamports: bigint;
  slippageBufferLamports: bigint;
  ataRentLamports: bigint;
  totalFeesLamports: bigint;
}

/**
 * Net profit calculation result
 */
export interface NetProfitResult {
  grossProfitLamports: bigint;
  netProfitLamports: bigint;
  netProfitBps: number;
  feeBreakdown: FeeBreakdown;
  isProfitable: boolean;
  meetsThresholds: boolean;
}

/**
 * Options for getting Jupiter quotes
 */
export interface JupiterQuoteOptions {
  slippageBps?: number;
  allowedDexes?: string[];
  excludedDexes?: string[];
  useMockOnFailure?: boolean;
  maxAccounts?: number;
}

// Estimated costs in lamports
const ESTIMATED_COMPUTE_BUDGET_LAMPORTS = BigInt(5000); // ~5000 lamports for compute
const ESTIMATED_ATA_RENT_LAMPORTS = BigInt(2039280); // Rent for one ATA if needed
const SLIPPAGE_BUFFER_MULTIPLIER = 0.005; // 0.5% additional slippage buffer

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
  const feeAmount = BigInt(Math.floor(Number(amount) * 0.003)); // 0.3% fee
  
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
        feeAmount: feeAmount.toString(),
        feeMint: inputMint,
      },
      percent: 100,
    }],
    contextSlot: Date.now(),
    timeTaken: Math.random() * 100,
    prioritizationFeeLamports: 1000,
    isMock: true,
  };
}

/**
 * Fetch a swap quote from Jupiter with optional DEX constraints
 * 
 * @param inputMint - Token mint address to swap FROM
 * @param outputMint - Token mint address to swap TO
 * @param amount - Amount in base units (lamports for SOL, smallest unit for SPL)
 * @param options - Quote options including slippage, DEX constraints
 * @returns Quote response or null if no route found
 */
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: bigint,
  options: JupiterQuoteOptions = {}
): Promise<JupiterQuoteResponse | null> {
  const {
    slippageBps = 100,
    allowedDexes,
    excludedDexes,
    useMockOnFailure = true,
    maxAccounts = 64,
  } = options;

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
      maxAccounts: maxAccounts.toString(),
      // REMOVED: onlyDirectRoutes - allow multi-hop for better routes
    });

    // Add DEX constraints if provided
    if (allowedDexes && allowedDexes.length > 0) {
      // Jupiter uses 'dexes' parameter for allowed DEXes
      params.set('dexes', allowedDexes.join(','));
      console.log(`[jupiter-client] Constraining to DEXes: ${allowedDexes.join(', ')}`);
    }

    if (excludedDexes && excludedDexes.length > 0) {
      // Jupiter uses 'excludeDexes' parameter
      params.set('excludeDexes', excludedDexes.join(','));
      console.log(`[jupiter-client] Excluding DEXes: ${excludedDexes.join(', ')}`);
    }

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
    
    // Extract route labels for logging
    const routeLabels = quote.routePlan?.map(r => r.swapInfo.label).join(' -> ') || 'Unknown';
    
    console.log('[jupiter-client] Quote received:', {
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
      routeSteps: quote.routePlan?.length || 0,
      routeLabels,
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
  // Block mock quotes from being used for real transactions
  if (quoteResponse.isMock) {
    throw new JupiterApiError(
      'Cannot create swap transaction from mock quote - mock quotes are not executable',
      undefined,
      { reason: 'mock_quote_blocked' }
    );
  }

  try {
    const url = `${JUPITER_API_BASE}/swap`;
    
    const requestBody = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: wrapUnwrapSOL,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
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
  // Block mock quotes from being used for real transactions
  if (quoteResponse.isMock) {
    throw new JupiterApiError(
      'Cannot get swap instructions from mock quote - mock quotes are not executable',
      undefined,
      { reason: 'mock_quote_blocked' }
    );
  }

  try {
    const url = `${JUPITER_API_BASE}/swap-instructions`;
    
    const requestBody = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: wrapUnwrapSOL,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
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
 * Extract total route fees from a quote's routePlan
 */
function extractRouteFees(quote: JupiterQuoteResponse): bigint {
  let totalFees = BigInt(0);
  
  if (quote.routePlan) {
    for (const route of quote.routePlan) {
      const feeAmount = BigInt(route.swapInfo.feeAmount || '0');
      totalFees += feeAmount;
    }
  }
  
  return totalFees;
}

/**
 * Calculate net profit from arbitrage after ALL fees
 * 
 * This is the "profit waterfall" that accounts for:
 * - Route fees from both legs
 * - Prioritization fees
 * - Compute budget costs
 * - Slippage buffer
 * - ATA rent (if new accounts needed)
 * 
 * @param initialAmountLamports - Starting amount in lamports
 * @param quote1 - Quote for first leg (A -> B)
 * @param quote2 - Quote for second leg (B -> A)
 * @param extraCostsLamports - Additional costs (e.g., ATA creation)
 * @returns Net profit result with full breakdown
 */
export function calculateArbitrageNetProfit(
  initialAmountLamports: bigint,
  quote1: JupiterQuoteResponse,
  quote2: JupiterQuoteResponse,
  extraCostsLamports: bigint = BigInt(0)
): NetProfitResult {
  // Gross profit = final amount - initial amount
  const finalAmount = BigInt(quote2.outAmount);
  const grossProfitLamports = finalAmount - initialAmountLamports;
  
  // Extract route fees from both legs
  const routeFees1 = extractRouteFees(quote1);
  const routeFees2 = extractRouteFees(quote2);
  const totalRouteFeesLamports = routeFees1 + routeFees2;
  
  // Priority fees from quotes (if available)
  const priorityFee1 = BigInt(quote1.prioritizationFeeLamports || 1000);
  const priorityFee2 = BigInt(quote2.prioritizationFeeLamports || 1000);
  const totalPriorityFeeLamports = priorityFee1 + priorityFee2;
  
  // Compute budget estimate
  const computeBudgetLamports = ESTIMATED_COMPUTE_BUDGET_LAMPORTS;
  
  // Slippage buffer based on price impact
  const priceImpact1 = parseFloat(quote1.priceImpactPct || '0');
  const priceImpact2 = parseFloat(quote2.priceImpactPct || '0');
  const totalPriceImpact = priceImpact1 + priceImpact2;
  const slippageBufferLamports = BigInt(
    Math.ceil(Number(initialAmountLamports) * (SLIPPAGE_BUFFER_MULTIPLIER + totalPriceImpact / 100))
  );
  
  // ATA rent (assume we might need to create one account)
  const ataRentLamports = extraCostsLamports > 0 ? extraCostsLamports : ESTIMATED_ATA_RENT_LAMPORTS;
  
  // Total fees
  const totalFeesLamports = 
    totalRouteFeesLamports + 
    totalPriorityFeeLamports + 
    computeBudgetLamports + 
    slippageBufferLamports;
  
  // Net profit = gross - fees (don't subtract ATA rent from profit calculation, only from threshold check)
  const netProfitLamports = grossProfitLamports - totalFeesLamports;
  
  // Calculate profit in basis points relative to initial amount
  const netProfitBps = Number((netProfitLamports * BigInt(10000)) / initialAmountLamports);
  
  // Check thresholds
  const isProfitable = netProfitLamports > BigInt(0);
  const meetsThresholds = 
    netProfitLamports >= BigInt(MIN_NET_PROFIT_LAMPORTS) &&
    netProfitBps >= MIN_PROFIT_BPS;
  
  const feeBreakdown: FeeBreakdown = {
    routeFeesLamports: totalRouteFeesLamports,
    priorityFeeLamports: totalPriorityFeeLamports,
    computeBudgetLamports,
    slippageBufferLamports,
    ataRentLamports,
    totalFeesLamports,
  };
  
  console.log('[jupiter-client] Net profit calculation:', {
    initialAmount: initialAmountLamports.toString(),
    finalAmount: finalAmount.toString(),
    grossProfit: grossProfitLamports.toString(),
    routeFees: totalRouteFeesLamports.toString(),
    priorityFees: totalPriorityFeeLamports.toString(),
    computeBudget: computeBudgetLamports.toString(),
    slippageBuffer: slippageBufferLamports.toString(),
    totalFees: totalFeesLamports.toString(),
    netProfit: netProfitLamports.toString(),
    netProfitBps,
    isProfitable,
    meetsThresholds,
  });
  
  return {
    grossProfitLamports,
    netProfitLamports,
    netProfitBps,
    feeBreakdown,
    isProfitable,
    meetsThresholds,
  };
}

/**
 * Legacy helper for backward compatibility
 * @deprecated Use calculateArbitrageNetProfit instead
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
 * Check if quotes are safe to execute (not mock data)
 */
export function areQuotesExecutable(quote1: JupiterQuoteResponse, quote2: JupiterQuoteResponse): {
  executable: boolean;
  reason?: string;
} {
  if (quote1.isMock) {
    return { executable: false, reason: 'Quote 1 (leg A) is mock data - not executable' };
  }
  if (quote2.isMock) {
    return { executable: false, reason: 'Quote 2 (leg B) is mock data - not executable' };
  }
  return { executable: true };
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
 */
export const COMMON_MINTS = {
  // Native SOL wrapped
  WSOL: 'So11111111111111111111111111111111111111112',
  // USDC (mainnet) - different on devnet
  USDC_MAINNET: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // USDT (mainnet) - different on devnet  
  USDT_MAINNET: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;
