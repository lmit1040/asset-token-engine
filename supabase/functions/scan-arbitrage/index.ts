import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getJupiterQuote,
  calculateArbitrageNetProfit,
  isValidSolanaAddress,
  setMockMode,
  isMockModeEnabled,
  areQuotesExecutable,
  getMinNetProfitLamports,
  getMinProfitBps,
  getMaxNotionalLamports,
  JupiterQuoteResponse,
  JupiterApiError,
  JupiterQuoteOptions,
  NetProfitResult,
} from "../_shared/jupiter-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment config
const ARB_ENV = Deno.env.get('ARB_ENV') || 'devnet';
const DEFAULT_TRADE_AMOUNT_LAMPORTS = BigInt(Deno.env.get('DEFAULT_TRADE_AMOUNT') || '100000000'); // 0.1 SOL

// Supported DEXs by Jupiter Aggregator
const SUPPORTED_DEXS = new Set([
  'Raydium',
  'Raydium CLMM',
  'Raydium CP',
  'Orca',
  'Orca (Whirlpools)',
  'Whirlpool',
  'Meteora',
  'Meteora DLMM',
  'Phoenix',
  'Lifinity',
  'Lifinity V2',
  'Cropper',
  'Cykura',
  'Saros',
  'Step Finance',
  'Penguin',
  'Sencha',
  'Saber',
  'Aldrin',
  'Crema',
  'Invariant',
  'Marinade',
  'Stepn',
  'OpenBook',
  'Serum',
  'GooseFX',
  'Dradex',
  'Balansol',
  'Marco Polo',
  'Oasis',
  'BonkSwap',
  'Pump.fun',
  'FluxBeam',
  'Helium Network',
  'Jupiter',
  'Mock DEX', // For mock mode
]);

// Validate DEX name
function isValidDexName(dexName: string): { valid: boolean; suggestion?: string } {
  if (!dexName) return { valid: true }; // Allow null/undefined for no constraint
  
  const normalizedInput = dexName.toLowerCase().trim();
  
  for (const dex of SUPPORTED_DEXS) {
    if (dex.toLowerCase() === normalizedInput) {
      return { valid: true };
    }
  }
  
  for (const dex of SUPPORTED_DEXS) {
    if (dex.toLowerCase().includes(normalizedInput) || normalizedInput.includes(dex.toLowerCase())) {
      return { valid: false, suggestion: dex };
    }
  }
  
  return { valid: false };
}

function getSupportedDexList(): string[] {
  return Array.from(SUPPORTED_DEXS).sort();
}

// Get primary DEX used in a route
function getPrimaryDex(quote: JupiterQuoteResponse): string {
  if (!quote.routePlan || quote.routePlan.length === 0) return 'Unknown';
  const sortedRoutes = [...quote.routePlan].sort((a, b) => b.percent - a.percent);
  return sortedRoutes[0]?.swapInfo?.label || 'Unknown';
}

// Get all DEXes used in a route
function getAllRouteDexes(quote: JupiterQuoteResponse): string[] {
  if (!quote.routePlan) return [];
  return quote.routePlan.map(r => r.swapInfo.label).filter(Boolean);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body for options
    let useMockMode = false;
    let forceMock = false;
    try {
      const body = await req.json();
      useMockMode = body?.mockMode === true;
      forceMock = body?.forceMock === true;
    } catch {
      // No body or invalid JSON is fine
    }

    // Enable mock mode if explicitly requested
    if (forceMock) {
      setMockMode(true);
      console.log('[scan-arbitrage] Force mock mode enabled via request');
    }

    const priceSourceLabel = useMockMode || forceMock 
      ? 'MOCK PRICES (simulated for testing)'
      : 'REAL DEX prices (with mock fallback on DNS errors)';

    console.log(`[scan-arbitrage] Starting arbitrage scan...`);
    console.log(`[scan-arbitrage] Environment: ${ARB_ENV}`);
    console.log(`[scan-arbitrage] Price source: ${priceSourceLabel}`);
    console.log(`[scan-arbitrage] Min net profit: ${getMinNetProfitLamports()} lamports`);
    console.log(`[scan-arbitrage] Min profit bps: ${getMinProfitBps()}`);

    // Get authorization header and extract JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[scan-arbitrage] No authorization header present');
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.replace('Bearer ', '');
    console.log('[scan-arbitrage] JWT token received, length:', jwt.length);

    // Create Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user from JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      console.error('[scan-arbitrage] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('[scan-arbitrage] User verified:', user.id, user.email);

    // Check admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError || roleData?.role !== 'admin') {
      console.error('[scan-arbitrage] User is not admin:', user.id);
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[scan-arbitrage] Admin verified, fetching enabled Solana strategies...');

    // Fetch enabled SOLANA strategies only
    const { data: strategies, error: stratError } = await supabase
      .from('arbitrage_strategies')
      .select('*')
      .eq('is_enabled', true)
      .or('chain_type.eq.SOLANA,chain_type.is.null');

    if (stratError) {
      console.error('[scan-arbitrage] Failed to fetch strategies:', stratError);
      throw new Error('Failed to fetch strategies');
    }

    console.log(`[scan-arbitrage] Found ${strategies?.length || 0} enabled Solana strategies`);

    const results = [];
    const maxNotional = getMaxNotionalLamports();

    for (const strategy of strategies || []) {
      const startedAt = new Date().toISOString();
      console.log(`\n[scan-arbitrage] ========== Strategy: ${strategy.name} ==========`);
      console.log(`[scan-arbitrage] Token In: ${strategy.token_in_mint}`);
      console.log(`[scan-arbitrage] Token Out: ${strategy.token_out_mint}`);
      console.log(`[scan-arbitrage] DEX A constraint: ${strategy.dex_a || 'None (any DEX)'}`);
      console.log(`[scan-arbitrage] DEX B constraint: ${strategy.dex_b || 'None (any DEX)'}`);

      // Validate token mint addresses and DEX names
      const validationErrors: string[] = [];
      if (!isValidSolanaAddress(strategy.token_in_mint)) {
        validationErrors.push(`Invalid token_in_mint address: ${strategy.token_in_mint}`);
      }
      if (!isValidSolanaAddress(strategy.token_out_mint)) {
        validationErrors.push(`Invalid token_out_mint address: ${strategy.token_out_mint}`);
      }
      
      // Only validate DEX names if they're specified (null means no constraint)
      if (strategy.dex_a) {
        const dexAValidation = isValidDexName(strategy.dex_a);
        if (!dexAValidation.valid) {
          const suggestion = dexAValidation.suggestion ? ` (did you mean "${dexAValidation.suggestion}"?)` : '';
          validationErrors.push(`Unsupported DEX A: "${strategy.dex_a}"${suggestion}`);
        }
      }
      if (strategy.dex_b) {
        const dexBValidation = isValidDexName(strategy.dex_b);
        if (!dexBValidation.valid) {
          const suggestion = dexBValidation.suggestion ? ` (did you mean "${dexBValidation.suggestion}"?)` : '';
          validationErrors.push(`Unsupported DEX B: "${strategy.dex_b}"${suggestion}`);
        }
      }

      if (validationErrors.length > 0) {
        console.error(`[scan-arbitrage] Strategy ${strategy.name} has validation errors:`, validationErrors);
        
        await supabase
          .from('arbitrage_runs')
          .insert({
            strategy_id: strategy.id,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            status: 'SIMULATED',
            estimated_profit_lamports: 0,
            actual_profit_lamports: null,
            tx_signature: null,
            error_message: `Validation failed: ${validationErrors.join('; ')}`,
            run_type: 'SCAN',
            purpose: strategy.is_for_fee_payer_refill ? 'FEE_PAYER_REFILL' : 
                     strategy.is_for_ops_refill ? 'OPS_REFILL' : 'MANUAL',
          });

        results.push({
          strategy_id: strategy.id,
          strategy_name: strategy.name,
          dex_a_constraint: strategy.dex_a,
          dex_b_constraint: strategy.dex_b,
          dex_used_a: null,
          dex_used_b: null,
          route_a_dexes: [],
          route_b_dexes: [],
          token_in_mint: strategy.token_in_mint,
          token_out_mint: strategy.token_out_mint,
          input_lamports: 0,
          output_leg_a: 0,
          output_leg_b: 0,
          gross_profit_lamports: 0,
          net_profit_lamports: 0,
          net_profit_bps: 0,
          fee_breakdown: null,
          meets_threshold: false,
          is_profitable: false,
          is_executable: false,
          price_source: null,
          is_mock: false,
          run_id: null,
          error: `Validation failed: ${validationErrors.join('; ')}`,
          validation_errors: validationErrors,
        });
        continue;
      }

      console.log(`[scan-arbitrage] Token addresses and DEX names validated`);

      // Determine trade amount (respect max notional cap)
      let inputLamports = DEFAULT_TRADE_AMOUNT_LAMPORTS;
      if (strategy.max_trade_value_native && BigInt(strategy.max_trade_value_native) > 0) {
        inputLamports = BigInt(strategy.max_trade_value_native);
      }
      if (inputLamports > maxNotional) {
        console.log(`[scan-arbitrage] Capping trade to max notional: ${maxNotional}`);
        inputLamports = maxNotional;
      }
      
      let quoteA: JupiterQuoteResponse | null = null;
      let quoteB: JupiterQuoteResponse | null = null;
      let netProfitResult: NetProfitResult | null = null;
      let quoteError: string | null = null;
      let dexUsedA = strategy.dex_a || 'Any';
      let dexUsedB = strategy.dex_b || 'Any';
      let routeADexes: string[] = [];
      let routeBDexes: string[] = [];

      try {
        // Step 1: Get quote for token_in -> token_out (leg A) with DEX constraint
        const optionsA: JupiterQuoteOptions = {
          slippageBps: 50, // 0.5% slippage
        };
        if (strategy.dex_a) {
          optionsA.allowedDexes = [strategy.dex_a];
        }
        
        console.log(`[scan-arbitrage] Fetching Leg A quote...`);
        quoteA = await getJupiterQuote(
          strategy.token_in_mint,
          strategy.token_out_mint,
          inputLamports,
          optionsA
        );

        if (quoteA) {
          dexUsedA = getPrimaryDex(quoteA);
          routeADexes = getAllRouteDexes(quoteA);
          console.log(`[scan-arbitrage] Leg A: ${inputLamports} -> ${quoteA.outAmount} via ${routeADexes.join(' -> ')}${quoteA.isMock ? ' (MOCK)' : ''}`);

          // Step 2: Get quote for token_out -> token_in (leg B) with DEX constraint
          const optionsB: JupiterQuoteOptions = {
            slippageBps: 50,
          };
          if (strategy.dex_b) {
            optionsB.allowedDexes = [strategy.dex_b];
          }
          
          console.log(`[scan-arbitrage] Fetching Leg B quote...`);
          quoteB = await getJupiterQuote(
            strategy.token_out_mint,
            strategy.token_in_mint,
            BigInt(quoteA.outAmount),
            optionsB
          );

          if (quoteB) {
            dexUsedB = getPrimaryDex(quoteB);
            routeBDexes = getAllRouteDexes(quoteB);
            console.log(`[scan-arbitrage] Leg B: ${quoteA.outAmount} -> ${quoteB.outAmount} via ${routeBDexes.join(' -> ')}${quoteB.isMock ? ' (MOCK)' : ''}`);

            // Calculate net profit using the profit waterfall
            netProfitResult = calculateArbitrageNetProfit(inputLamports, quoteA, quoteB);
            console.log(`[scan-arbitrage] Net profit: ${netProfitResult.netProfitLamports} lamports (${netProfitResult.netProfitBps} bps)`);
            console.log(`[scan-arbitrage] Meets thresholds: ${netProfitResult.meetsThresholds}`);
          } else {
            quoteError = 'No route found for return leg (B)';
            console.warn(`[scan-arbitrage] ${quoteError}`);
          }
        } else {
          quoteError = 'No route found for initial leg (A)';
          console.warn(`[scan-arbitrage] ${quoteError}`);
        }
      } catch (error) {
        if (error instanceof JupiterApiError) {
          quoteError = `Jupiter API error: ${error.message}`;
        } else {
          quoteError = `Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`;
        }
        console.error(`[scan-arbitrage] ${quoteError}`);
      }

      const finishedAt = new Date().toISOString();
      
      // Check if quotes are executable (not mock)
      const isMockData = quoteA?.isMock || quoteB?.isMock || false;
      const executableCheck = quoteA && quoteB ? areQuotesExecutable(quoteA, quoteB) : { executable: false, reason: 'Missing quotes' };
      
      // Determine if this is a profitable, executable opportunity
      const isProfitable = netProfitResult?.isProfitable || false;
      const meetsThreshold = netProfitResult?.meetsThresholds || false;
      const isExecutable = executableCheck.executable && meetsThreshold;

      // Create arbitrage_runs record with detailed data
      const runInsert = {
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: finishedAt,
        status: 'SIMULATED' as const,
        estimated_profit_lamports: Number(netProfitResult?.netProfitLamports || 0),
        estimated_gas_cost_native: Number(netProfitResult?.feeBreakdown.totalFeesLamports || 0),
        actual_profit_lamports: null,
        tx_signature: null,
        error_message: quoteError || (isMockData && !executableCheck.executable ? executableCheck.reason : null),
        run_type: 'SCAN',
        purpose: strategy.is_for_fee_payer_refill ? 'FEE_PAYER_REFILL' : 
                 strategy.is_for_ops_refill ? 'OPS_REFILL' : 'MANUAL',
        approved_for_auto_execution: isExecutable && strategy.is_auto_enabled,
      };

      const { data: runData, error: runError } = await supabase
        .from('arbitrage_runs')
        .insert(runInsert)
        .select()
        .single();

      if (runError) {
        console.error(`[scan-arbitrage] Failed to insert run for ${strategy.name}:`, runError);
      } else {
        console.log(`[scan-arbitrage] Created run ${runData.id} - net profit: ${netProfitResult?.netProfitLamports || 0} lamports, executable: ${isExecutable}`);
      }
      
      results.push({
        strategy_id: strategy.id,
        strategy_name: strategy.name,
        dex_a_constraint: strategy.dex_a,
        dex_b_constraint: strategy.dex_b,
        dex_used_a: dexUsedA,
        dex_used_b: dexUsedB,
        route_a_dexes: routeADexes,
        route_b_dexes: routeBDexes,
        token_in_mint: strategy.token_in_mint,
        token_out_mint: strategy.token_out_mint,
        input_lamports: Number(inputLamports),
        output_leg_a: Number(quoteA?.outAmount || 0),
        output_leg_b: Number(quoteB?.outAmount || 0),
        gross_profit_lamports: Number(netProfitResult?.grossProfitLamports || 0),
        net_profit_lamports: Number(netProfitResult?.netProfitLamports || 0),
        net_profit_bps: netProfitResult?.netProfitBps || 0,
        net_profit_sol: Number(netProfitResult?.netProfitLamports || 0) / 1_000_000_000,
        fee_breakdown: netProfitResult ? {
          route_fees: Number(netProfitResult.feeBreakdown.routeFeesLamports),
          priority_fees: Number(netProfitResult.feeBreakdown.priorityFeeLamports),
          compute_budget: Number(netProfitResult.feeBreakdown.computeBudgetLamports),
          slippage_buffer: Number(netProfitResult.feeBreakdown.slippageBufferLamports),
          total_fees: Number(netProfitResult.feeBreakdown.totalFeesLamports),
        } : null,
        meets_threshold: meetsThreshold,
        is_profitable: isProfitable,
        is_executable: isExecutable,
        is_mock: isMockData,
        mock_blocked_reason: isMockData ? executableCheck.reason : null,
        price_source: isMockData ? 'Mock Prices (NOT EXECUTABLE)' : 'Jupiter Aggregator (Real DEX Prices)',
        run_id: runData?.id || null,
        error: quoteError,
      });
    }

    // Reset mock mode after scan
    setMockMode(false);

    const mockCount = results.filter(r => r.is_mock).length;
    const profitableCount = results.filter(r => r.is_profitable && !r.is_mock).length;
    const executableCount = results.filter(r => r.is_executable).length;
    
    console.log(`\n[scan-arbitrage] ========== SCAN COMPLETE ==========`);
    console.log(`[scan-arbitrage] Total strategies: ${results.length}`);
    console.log(`[scan-arbitrage] Profitable (real): ${profitableCount}`);
    console.log(`[scan-arbitrage] Executable: ${executableCount}`);
    console.log(`[scan-arbitrage] Mock data (blocked): ${mockCount}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Arbitrage scan complete`,
      environment: ARB_ENV,
      thresholds: {
        min_net_profit_lamports: getMinNetProfitLamports(),
        min_profit_bps: getMinProfitBps(),
        max_notional_lamports: Number(getMaxNotionalLamports()),
      },
      price_source: mockCount > 0 
        ? `Mixed: ${results.length - mockCount} real, ${mockCount} mock (Jupiter API DNS issues)` 
        : 'Jupiter Aggregator API (v6) - Real DEX prices',
      supported_dexs: getSupportedDexList(),
      simulations: results,
      summary: {
        total_strategies: results.length,
        profitable_count: profitableCount,
        executable_count: executableCount,
        mock_count: mockCount,
        validation_failed_count: results.filter(r => (r.validation_errors?.length ?? 0) > 0).length,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[scan-arbitrage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
