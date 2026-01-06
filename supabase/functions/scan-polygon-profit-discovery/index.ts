// Polygon Profit Discovery Scanner
// Scans for profitable arbitrage using source constraints and triangular paths
// SCAN-ONLY mode by default - OPS wallet only, no user wallets

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getZeroXQuoteWithDetails, POLYGON_LIQUIDITY_SOURCES } from "../_shared/zerox-client.ts";
import { POLYGON_TOKENS, OPS_REFILL_CONFIG, formatUSDC, formatWETH, formatPOL } from "../_shared/polygon-tokens.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Scan modes
type ScanMode = "SOURCE_MATRIX" | "TRIANGULAR";

// Token pairs for scanning
const TOKEN_PAIRS = {
  "USDC_WETH": { base: "USDC_E", quote: "WETH" },
  "USDC_WMATIC": { base: "USDC_E", quote: "WMATIC" },
} as const;

// Triangular paths
const TRIANGULAR_PATHS = {
  "USDC_WETH_WMATIC": ["USDC_E", "WETH", "WMATIC", "USDC_E"],
} as const;

// Default configuration - can be overridden by request
const DEFAULT_MAX_COMBINATIONS = 5;
const SLIPPAGE_BPS = 30; // 0.3%
const GAS_PRICE_GWEI = 50; // Conservative estimate
const DEFAULT_INTER_QUOTE_DELAY_MS = 1500;
const DEFAULT_BATCH_PAUSE_MS = 5000;
const DEFAULT_BATCH_SIZE = 2;
const RATE_LIMIT_THRESHOLD = 2; // Circuit breaker after 2 total rate limits

interface ScanSpeedConfig {
  delayMs: number;
  batchPauseMs: number;
  batchSize: number;
}

interface ScanRequest {
  mode: ScanMode;
  tokenPair?: keyof typeof TOKEN_PAIRS;
  triangularPath?: keyof typeof TRIANGULAR_PATHS;
  includedSources?: string[];
  notionalOverride?: number; // USDC amount (human readable)
  maxCombinations?: number;
  scanSpeed?: ScanSpeedConfig;
}

interface ScanResult {
  mode: ScanMode;
  sourceA?: string;
  sourceB?: string;
  sourceC?: string;
  tokenPath: string[];
  notionalIn: string;
  expectedGrossProfit: string;
  expectedNetProfit: string;
  profitBps: number;
  gasEstimate: string;
  slippageBuffer: string;
  status: "PROFITABLE" | "NOT_PROFITABLE" | "FAILED";
  reason?: string;
  leg1Quote?: {
    buyAmount: string;
    sources: string[];
  };
  leg2Quote?: {
    buyAmount: string;
    sources: string[];
  };
  leg3Quote?: {
    buyAmount: string;
    sources: string[];
  };
}

// Record scan event to database
async function recordScanEvent(
  supabase: any,
  result: ScanResult,
  mode: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("ops_arbitrage_events")
      .insert({
        chain: "EVM",
        network: "POLYGON",
        mode: mode,
        notional_in: result.notionalIn,
        expected_gross_profit: result.expectedGrossProfit,
        expected_net_profit: result.expectedNetProfit,
        status: result.status === "PROFITABLE" ? "SIMULATED" : "ABORTED",
        error_message: result.reason || `Sources: ${result.sourceA || "any"} -> ${result.sourceB || "any"}${result.sourceC ? ` -> ${result.sourceC}` : ""}`,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[profit-discovery] Failed to record event:", error);
      return null;
    }
    return data?.id;
  } catch (err) {
    console.error("[profit-discovery] Record error:", err);
    return null;
  }
}

// Quote a single leg with source constraints - returns detailed result
async function quoteLeg(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  includedSources?: string[]
): Promise<{ buyAmount: string; sources: string[]; wasRateLimited: boolean } | null> {
  const result = await getZeroXQuoteWithDetails({
    network: "POLYGON",
    sellToken,
    buyToken,
    sellAmount,
    includedSources,
  });

  if (!result.quote) {
    return null;
  }

  return {
    buyAmount: result.quote.buyAmount,
    sources: result.quote.sources || [],
    wasRateLimited: result.wasRateLimited || false,
  };
}

// Calculate net profit with waterfall deductions
function calculateNetProfit(
  notionalIn: bigint,
  finalOutput: bigint,
  gasEstimateWei: bigint,
  slippageBps: number
): { grossProfit: bigint; netProfit: bigint; slippageBuffer: bigint; profitBps: number } {
  const grossProfit = finalOutput - notionalIn;
  
  // Slippage buffer (on notional)
  const slippageBuffer = (notionalIn * BigInt(slippageBps)) / 10000n;
  
  // Gas cost estimation (convert from POL to USDC equivalent, rough estimate)
  // Assuming 1 POL ≈ $0.40, gas ~150k units at 50 gwei
  const gasEstimateUsdc = (gasEstimateWei * 40n) / (100n * 10n ** 12n); // Very rough
  
  const netProfit = grossProfit - slippageBuffer - gasEstimateUsdc;
  
  // Profit in basis points
  const profitBps = notionalIn > 0n 
    ? Number((netProfit * 10000n) / notionalIn)
    : 0;

  return { grossProfit, netProfit, slippageBuffer, profitBps };
}

// Source Matrix Scan with circuit breaker
async function runSourceMatrixScan(
  supabase: any,
  tokenPair: { base: string; quote: string },
  sources: string[],
  notionalUsdc: bigint,
  maxCombinations: number,
  speedConfig: ScanSpeedConfig
): Promise<{ results: ScanResult[]; rateLimitCount: number; abortedDueToRateLimit: boolean }> {
  const { delayMs, batchPauseMs, batchSize } = speedConfig;
  const results: ScanResult[] = [];
  const baseToken = POLYGON_TOKENS[tokenPair.base as keyof typeof POLYGON_TOKENS];
  const quoteToken = POLYGON_TOKENS[tokenPair.quote as keyof typeof POLYGON_TOKENS];
  
  let totalRateLimits = 0;
  let abortedDueToRateLimit = false;
  
  if (!baseToken || !quoteToken) {
    console.error("[profit-discovery] Invalid token pair");
    return { results, rateLimitCount: 0, abortedDueToRateLimit: false };
  }

  // Generate source combinations (sourceA != sourceB)
  const combinations: [string, string][] = [];
  for (const sourceA of sources) {
    for (const sourceB of sources) {
      if (sourceA !== sourceB) {
        combinations.push([sourceA, sourceB]);
      }
    }
  }

  // Randomize and limit combinations
  const shuffled = combinations.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, maxCombinations);

  console.log(`[profit-discovery] Running SOURCE_MATRIX scan with ${selected.length} combinations`);

  let processedCount = 0;
  
  for (const [sourceA, sourceB] of selected) {
    // Circuit breaker check - now based on TOTAL rate limits, not consecutive
    if (totalRateLimits >= RATE_LIMIT_THRESHOLD) {
      console.warn(`[profit-discovery] Circuit breaker triggered after ${totalRateLimits} total rate limits. Aborting scan.`);
      abortedDueToRateLimit = true;
      break;
    }
    
    // Batch pause - after every batchSize combinations, take a longer break
    if (processedCount > 0 && processedCount % batchSize === 0) {
      console.log(`[profit-discovery] Batch pause: ${batchPauseMs}ms after ${processedCount} combinations`);
      await new Promise(r => setTimeout(r, batchPauseMs));
    }
    
    try {
      // Leg 1: base -> quote (e.g., USDC -> WETH)
      console.log(`[profit-discovery] Starting leg 1: ${sourceA}`);
      const leg1 = await quoteLeg(
        baseToken.address,
        quoteToken.address,
        notionalUsdc.toString(),
        [sourceA]
      );

      if (!leg1) {
        results.push({
          mode: "SOURCE_MATRIX",
          sourceA,
          sourceB,
          tokenPath: [baseToken.symbol, quoteToken.symbol, baseToken.symbol],
          notionalIn: notionalUsdc.toString(),
          expectedGrossProfit: "0",
          expectedNetProfit: "0",
          profitBps: 0,
          gasEstimate: "0",
          slippageBuffer: "0",
          status: "FAILED",
          reason: `Leg1 quote failed for ${sourceA}`,
        });
        processedCount++;
        // Wait before next attempt even on failure
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      
      // Check if rate limited (cumulative tracking)
      if (leg1.wasRateLimited) {
        totalRateLimits++;
        console.warn(`[profit-discovery] Rate limit detected (total: ${totalRateLimits})`);
        // Extra delay after rate limit
        await new Promise(r => setTimeout(r, 3000));
      }

      // Longer delay between quotes
      await new Promise(r => setTimeout(r, delayMs));

      // Leg 2: quote -> base (e.g., WETH -> USDC)
      const leg2 = await quoteLeg(
        quoteToken.address,
        baseToken.address,
        leg1.buyAmount,
        [sourceB]
      );

      if (!leg2) {
        results.push({
          mode: "SOURCE_MATRIX",
          sourceA,
          sourceB,
          tokenPath: [baseToken.symbol, quoteToken.symbol, baseToken.symbol],
          notionalIn: notionalUsdc.toString(),
          expectedGrossProfit: "0",
          expectedNetProfit: "0",
          profitBps: 0,
          gasEstimate: "0",
          slippageBuffer: "0",
          status: "FAILED",
          reason: `Leg2 quote failed for ${sourceB}`,
          leg1Quote: { buyAmount: leg1.buyAmount, sources: leg1.sources },
        });
        processedCount++;
        // Wait before next attempt even on failure
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      
      // Check if rate limited (cumulative tracking)
      if (leg2.wasRateLimited) {
        totalRateLimits++;
        console.warn(`[profit-discovery] Rate limit detected (total: ${totalRateLimits})`);
        // Extra delay after rate limit
        await new Promise(r => setTimeout(r, 3000));
      }

      // Calculate profits
      const gasEstimateWei = 300000n * BigInt(GAS_PRICE_GWEI) * 10n ** 9n; // ~300k gas for 2 swaps
      const { grossProfit, netProfit, slippageBuffer, profitBps } = calculateNetProfit(
        notionalUsdc,
        BigInt(leg2.buyAmount),
        gasEstimateWei,
        SLIPPAGE_BPS
      );

      const result: ScanResult = {
        mode: "SOURCE_MATRIX",
        sourceA,
        sourceB,
        tokenPath: [baseToken.symbol, quoteToken.symbol, baseToken.symbol],
        notionalIn: notionalUsdc.toString(),
        expectedGrossProfit: grossProfit.toString(),
        expectedNetProfit: netProfit.toString(),
        profitBps,
        gasEstimate: gasEstimateWei.toString(),
        slippageBuffer: slippageBuffer.toString(),
        status: netProfit > 0n ? "PROFITABLE" : "NOT_PROFITABLE",
        leg1Quote: { buyAmount: leg1.buyAmount, sources: leg1.sources },
        leg2Quote: { buyAmount: leg2.buyAmount, sources: leg2.sources },
      };

      results.push(result);

      // Record to database
      await recordScanEvent(supabase, result, "SOURCE_MATRIX");

      // Delay between combinations
      await new Promise(r => setTimeout(r, delayMs));

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`[profit-discovery] Error for ${sourceA}->${sourceB}:`, err);
      results.push({
        mode: "SOURCE_MATRIX",
        sourceA,
        sourceB,
        tokenPath: [baseToken.symbol, quoteToken.symbol, baseToken.symbol],
        notionalIn: notionalUsdc.toString(),
        expectedGrossProfit: "0",
        expectedNetProfit: "0",
        profitBps: 0,
        gasEstimate: "0",
        slippageBuffer: "0",
        status: "FAILED",
        reason: `Error: ${errorMessage}`,
      });
    }
    
    processedCount++;
  }

  return { results, rateLimitCount: totalRateLimits, abortedDueToRateLimit };
}

// Triangular Scan with circuit breaker
async function runTriangularScan(
  supabase: any,
  path: string[],
  sources: string[],
  notionalUsdc: bigint,
  maxCombinations: number,
  speedConfig: ScanSpeedConfig
): Promise<{ results: ScanResult[]; rateLimitCount: number; abortedDueToRateLimit: boolean }> {
  const { delayMs, batchPauseMs, batchSize } = speedConfig;
  const results: ScanResult[] = [];
  
  let totalRateLimits = 0;
  let abortedDueToRateLimit = false;
  
  // Get token configs
  const tokens = path.map(t => POLYGON_TOKENS[t as keyof typeof POLYGON_TOKENS]);
  if (tokens.some(t => !t)) {
    console.error("[profit-discovery] Invalid triangular path");
    return { results, rateLimitCount: 0, abortedDueToRateLimit: false };
  }

  // Generate source combinations for 3 legs
  const combinations: [string, string, string][] = [];
  for (const sourceA of sources) {
    for (const sourceB of sources) {
      for (const sourceC of sources) {
        // Allow same source for different legs in triangular
        combinations.push([sourceA, sourceB, sourceC]);
      }
    }
  }

  // Randomize and limit
  const shuffled = combinations.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, maxCombinations);

  console.log(`[profit-discovery] Running TRIANGULAR scan with ${selected.length} combinations`);

  let processedCount = 0;
  
  for (const [sourceA, sourceB, sourceC] of selected) {
    // Circuit breaker check - based on TOTAL rate limits
    if (totalRateLimits >= RATE_LIMIT_THRESHOLD) {
      console.warn(`[profit-discovery] Circuit breaker triggered after ${totalRateLimits} total rate limits. Aborting scan.`);
      abortedDueToRateLimit = true;
      break;
    }
    
    // Batch pause
    if (processedCount > 0 && processedCount % batchSize === 0) {
      console.log(`[profit-discovery] Batch pause: ${batchPauseMs}ms after ${processedCount} combinations`);
      await new Promise(r => setTimeout(r, batchPauseMs));
    }
    
    try {
      // Leg 1: USDC -> WETH
      console.log(`[profit-discovery] Starting triangular leg 1: ${sourceA}`);
      const leg1 = await quoteLeg(
        tokens[0]!.address,
        tokens[1]!.address,
        notionalUsdc.toString(),
        [sourceA]
      );

      if (!leg1) {
        results.push({
          mode: "TRIANGULAR",
          sourceA,
          sourceB,
          sourceC,
          tokenPath: path,
          notionalIn: notionalUsdc.toString(),
          expectedGrossProfit: "0",
          expectedNetProfit: "0",
          profitBps: 0,
          gasEstimate: "0",
          slippageBuffer: "0",
          status: "FAILED",
          reason: `Leg1 quote failed for ${sourceA}`,
        });
        processedCount++;
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      
      if (leg1.wasRateLimited) {
        totalRateLimits++;
        console.warn(`[profit-discovery] Rate limit detected (total: ${totalRateLimits})`);
        await new Promise(r => setTimeout(r, 3000));
      }

      await new Promise(r => setTimeout(r, delayMs));

      // Leg 2: WETH -> WMATIC
      const leg2 = await quoteLeg(
        tokens[1]!.address,
        tokens[2]!.address,
        leg1.buyAmount,
        [sourceB]
      );

      if (!leg2) {
        results.push({
          mode: "TRIANGULAR",
          sourceA,
          sourceB,
          sourceC,
          tokenPath: path,
          notionalIn: notionalUsdc.toString(),
          expectedGrossProfit: "0",
          expectedNetProfit: "0",
          profitBps: 0,
          gasEstimate: "0",
          slippageBuffer: "0",
          status: "FAILED",
          reason: `Leg2 quote failed for ${sourceB}`,
          leg1Quote: { buyAmount: leg1.buyAmount, sources: leg1.sources },
        });
        processedCount++;
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      
      if (leg2.wasRateLimited) {
        totalRateLimits++;
        console.warn(`[profit-discovery] Rate limit detected (total: ${totalRateLimits})`);
        await new Promise(r => setTimeout(r, 3000));
      }

      await new Promise(r => setTimeout(r, delayMs));

      // Leg 3: WMATIC -> USDC
      const leg3 = await quoteLeg(
        tokens[2]!.address,
        tokens[3]!.address,
        leg2.buyAmount,
        [sourceC]
      );

      if (!leg3) {
        results.push({
          mode: "TRIANGULAR",
          sourceA,
          sourceB,
          sourceC,
          tokenPath: path,
          notionalIn: notionalUsdc.toString(),
          expectedGrossProfit: "0",
          expectedNetProfit: "0",
          profitBps: 0,
          gasEstimate: "0",
          slippageBuffer: "0",
          status: "FAILED",
          reason: `Leg3 quote failed for ${sourceC}`,
          leg1Quote: { buyAmount: leg1.buyAmount, sources: leg1.sources },
          leg2Quote: { buyAmount: leg2.buyAmount, sources: leg2.sources },
        });
        processedCount++;
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      
      if (leg3.wasRateLimited) {
        totalRateLimits++;
        console.warn(`[profit-discovery] Rate limit detected (total: ${totalRateLimits})`);
        await new Promise(r => setTimeout(r, 3000));
      }

      // Calculate profits (3 swaps = higher gas)
      const gasEstimateWei = 450000n * BigInt(GAS_PRICE_GWEI) * 10n ** 9n;
      const { grossProfit, netProfit, slippageBuffer, profitBps } = calculateNetProfit(
        notionalUsdc,
        BigInt(leg3.buyAmount),
        gasEstimateWei,
        SLIPPAGE_BPS
      );

      const result: ScanResult = {
        mode: "TRIANGULAR",
        sourceA,
        sourceB,
        sourceC,
        tokenPath: path,
        notionalIn: notionalUsdc.toString(),
        expectedGrossProfit: grossProfit.toString(),
        expectedNetProfit: netProfit.toString(),
        profitBps,
        gasEstimate: gasEstimateWei.toString(),
        slippageBuffer: slippageBuffer.toString(),
        status: netProfit > 0n ? "PROFITABLE" : "NOT_PROFITABLE",
        leg1Quote: { buyAmount: leg1.buyAmount, sources: leg1.sources },
        leg2Quote: { buyAmount: leg2.buyAmount, sources: leg2.sources },
        leg3Quote: { buyAmount: leg3.buyAmount, sources: leg3.sources },
      };

      results.push(result);
      await recordScanEvent(supabase, result, "TRIANGULAR");
      await new Promise(r => setTimeout(r, delayMs));

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`[profit-discovery] Triangular error:`, err);
      results.push({
        mode: "TRIANGULAR",
        sourceA,
        sourceB,
        sourceC,
        tokenPath: [...path],
        notionalIn: notionalUsdc.toString(),
        expectedGrossProfit: "0",
        expectedNetProfit: "0",
        profitBps: 0,
        gasEstimate: "0",
        slippageBuffer: "0",
        status: "FAILED",
        reason: `Error: ${errorMessage}`,
      });
    }
    
    processedCount++;
  }

  return { results, rateLimitCount: totalRateLimits, abortedDueToRateLimit };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    const body: ScanRequest = await req.json().catch(() => ({
      mode: "SOURCE_MATRIX" as ScanMode,
      tokenPair: "USDC_WETH" as keyof typeof TOKEN_PAIRS,
    }));

    const mode = body.mode || "SOURCE_MATRIX";
    const maxCombinations = Math.min(body.maxCombinations || DEFAULT_MAX_COMBINATIONS, 50);
    
    // Get speed config from request or use defaults
    const speedConfig: ScanSpeedConfig = body.scanSpeed || {
      delayMs: DEFAULT_INTER_QUOTE_DELAY_MS,
      batchPauseMs: DEFAULT_BATCH_PAUSE_MS,
      batchSize: DEFAULT_BATCH_SIZE,
    };
    
    // Use provided sources or defaults
    const sources = body.includedSources?.length 
      ? body.includedSources 
      : ["Uniswap_V3", "QuickSwap", "SushiSwap", "Curve", "Balancer_V2"];

    // Calculate notional in base units (USDC = 6 decimals)
    const notionalHuman = body.notionalOverride || 1000; // Default 1000 USDC
    const notionalUsdc = BigInt(Math.floor(notionalHuman * 1_000_000));

    console.log(`[profit-discovery] Starting ${mode} scan with ${sources.length} sources, notional: ${notionalHuman} USDC, speed: ${speedConfig.delayMs}ms delay`);

    let results: ScanResult[] = [];
    let rateLimitCount = 0;
    let abortedDueToRateLimit = false;

    if (mode === "SOURCE_MATRIX") {
      const tokenPair = TOKEN_PAIRS[body.tokenPair || "USDC_WETH"];
      const scanResult = await runSourceMatrixScan(supabase, tokenPair, sources, notionalUsdc, maxCombinations, speedConfig);
      results = scanResult.results;
      rateLimitCount = scanResult.rateLimitCount;
      abortedDueToRateLimit = scanResult.abortedDueToRateLimit;
    } else if (mode === "TRIANGULAR") {
      const path = [...TRIANGULAR_PATHS[body.triangularPath || "USDC_WETH_WMATIC"]];
      const scanResult = await runTriangularScan(supabase, path, sources, notionalUsdc, maxCombinations, speedConfig);
      results = scanResult.results;
      rateLimitCount = scanResult.rateLimitCount;
      abortedDueToRateLimit = scanResult.abortedDueToRateLimit;
    }

    // Sort by net profit descending
    results.sort((a, b) => {
      const profitA = BigInt(a.expectedNetProfit || "0");
      const profitB = BigInt(b.expectedNetProfit || "0");
      return profitB > profitA ? 1 : profitB < profitA ? -1 : 0;
    });

    // Take top 20
    const topResults = results.slice(0, 20);

    // Summary stats
    const profitable = results.filter(r => r.status === "PROFITABLE").length;
    const failed = results.filter(r => r.status === "FAILED").length;
    const notProfitable = results.filter(r => r.status === "NOT_PROFITABLE").length;

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        sourcesUsed: sources,
        notionalUsdc: notionalHuman,
        totalScanned: results.length,
        profitable,
        notProfitable,
        failed,
        rateLimitCount,
        abortedDueToRateLimit,
        durationMs: duration,
        topResults: topResults.map(r => ({
          ...r,
          notionalFormatted: formatUSDC(BigInt(r.notionalIn)),
          grossProfitFormatted: formatUSDC(BigInt(r.expectedGrossProfit)),
          netProfitFormatted: formatUSDC(BigInt(r.expectedNetProfit)),
        })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[profit-discovery] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
