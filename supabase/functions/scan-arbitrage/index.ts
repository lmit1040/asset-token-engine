import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getJupiterQuote,
  calculateArbitrageProfit,
  isValidSolanaAddress,
  JupiterQuoteResponse,
  JupiterApiError,
} from "../_shared/jupiter-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
]);

// Validate DEX name
function isValidDexName(dexName: string): { valid: boolean; suggestion?: string } {
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[scan-arbitrage] Starting arbitrage simulation scan with REAL DEX prices...');

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

    console.log('[scan-arbitrage] Admin verified, fetching enabled strategies...');

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

    for (const strategy of strategies || []) {
      const startedAt = new Date().toISOString();
      console.log(`[scan-arbitrage] Simulating strategy: ${strategy.name}`);
      console.log(`[scan-arbitrage] Token In: ${strategy.token_in_mint}, Token Out: ${strategy.token_out_mint}`);
      console.log(`[scan-arbitrage] DEX A: ${strategy.dex_a}, DEX B: ${strategy.dex_b}`);

      // Validate token mint addresses and DEX names
      const validationErrors: string[] = [];
      if (!isValidSolanaAddress(strategy.token_in_mint)) {
        validationErrors.push(`Invalid token_in_mint address: ${strategy.token_in_mint}`);
      }
      if (!isValidSolanaAddress(strategy.token_out_mint)) {
        validationErrors.push(`Invalid token_out_mint address: ${strategy.token_out_mint}`);
      }
      
      const dexAValidation = isValidDexName(strategy.dex_a);
      if (!dexAValidation.valid) {
        const suggestion = dexAValidation.suggestion ? ` (did you mean "${dexAValidation.suggestion}"?)` : '';
        validationErrors.push(`Unsupported DEX A: "${strategy.dex_a}"${suggestion}`);
      }
      const dexBValidation = isValidDexName(strategy.dex_b);
      if (!dexBValidation.valid) {
        const suggestion = dexBValidation.suggestion ? ` (did you mean "${dexBValidation.suggestion}"?)` : '';
        validationErrors.push(`Unsupported DEX B: "${strategy.dex_b}"${suggestion}`);
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
          });

        results.push({
          strategy_id: strategy.id,
          strategy_name: strategy.name,
          dex_a: strategy.dex_a,
          dex_b: strategy.dex_b,
          dex_used_a: null,
          dex_used_b: null,
          token_in_mint: strategy.token_in_mint,
          token_out_mint: strategy.token_out_mint,
          input_lamports: 0,
          output_leg_a: 0,
          output_leg_b: 0,
          estimated_profit_lamports: 0,
          estimated_profit_sol: 0,
          meets_min_threshold: false,
          price_source: null,
          run_id: null,
          error: `Validation failed: ${validationErrors.join('; ')}`,
          validation_errors: validationErrors,
        });
        continue;
      }

      console.log(`[scan-arbitrage] Token addresses validated successfully`);

      // Use 0.1 SOL worth as test input (100 million lamports = 0.1 SOL)
      const inputLamports = BigInt(100_000_000);
      
      let estimatedProfitLamports = BigInt(0);
      let dexUsedA = strategy.dex_a;
      let dexUsedB = strategy.dex_b;
      let quoteError: string | null = null;
      let outAmountA = BigInt(0);
      let outAmountB = BigInt(0);

      try {
        // Step 1: Get quote for token_in -> token_out (leg A) using jupiter-client
        const quoteA = await getJupiterQuote(
          strategy.token_in_mint,
          strategy.token_out_mint,
          inputLamports,
          50 // 0.5% slippage
        );

        if (quoteA) {
          outAmountA = BigInt(quoteA.outAmount);
          dexUsedA = getPrimaryDex(quoteA);
          console.log(`[scan-arbitrage] Leg A: ${inputLamports} -> ${outAmountA} via ${dexUsedA}`);

          // Step 2: Get quote for token_out -> token_in (leg B - round trip)
          const quoteB = await getJupiterQuote(
            strategy.token_out_mint,
            strategy.token_in_mint,
            outAmountA,
            50
          );

          if (quoteB) {
            outAmountB = BigInt(quoteB.outAmount);
            dexUsedB = getPrimaryDex(quoteB);
            console.log(`[scan-arbitrage] Leg B: ${outAmountA} -> ${outAmountB} via ${dexUsedB}`);

            // Calculate round-trip profit using helper
            estimatedProfitLamports = calculateArbitrageProfit(inputLamports, quoteA, quoteB);
            console.log(`[scan-arbitrage] Round-trip profit: ${estimatedProfitLamports} lamports`);
          } else {
            quoteError = 'No route found for return leg';
            console.warn(`[scan-arbitrage] ${quoteError}`);
          }
        } else {
          quoteError = 'No route found for initial leg';
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

      // Create arbitrage_runs record
      const { data: runData, error: runError } = await supabase
        .from('arbitrage_runs')
        .insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: finishedAt,
          status: 'SIMULATED',
          estimated_profit_lamports: Number(estimatedProfitLamports),
          actual_profit_lamports: null,
          tx_signature: null,
          error_message: quoteError,
        })
        .select()
        .single();

      if (runError) {
        console.error(`[scan-arbitrage] Failed to insert run for ${strategy.name}:`, runError);
      } else {
        console.log(`[scan-arbitrage] Created run ${runData.id} for ${strategy.name}, profit: ${estimatedProfitLamports} lamports`);
      }

      results.push({
        strategy_id: strategy.id,
        strategy_name: strategy.name,
        dex_a: strategy.dex_a,
        dex_b: strategy.dex_b,
        dex_used_a: dexUsedA,
        dex_used_b: dexUsedB,
        token_in_mint: strategy.token_in_mint,
        token_out_mint: strategy.token_out_mint,
        input_lamports: Number(inputLamports),
        output_leg_a: Number(outAmountA),
        output_leg_b: Number(outAmountB),
        estimated_profit_lamports: Number(estimatedProfitLamports),
        estimated_profit_sol: Number(estimatedProfitLamports) / 1_000_000_000,
        meets_min_threshold: Number(estimatedProfitLamports) >= strategy.min_profit_lamports,
        price_source: 'Jupiter Aggregator (Real DEX Prices)',
        run_id: runData?.id || null,
        error: quoteError,
      });
    }

    console.log(`[scan-arbitrage] Scan complete. ${results.length} strategies simulated with REAL prices.`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Arbitrage simulation scan complete using REAL Jupiter DEX prices',
      price_source: 'Jupiter Aggregator API (v6) - aggregates Raydium, Orca, and other Solana DEXs',
      supported_dexs: getSupportedDexList(),
      simulations: results,
      total_strategies: results.length,
      profitable_count: results.filter(r => r.meets_min_threshold && r.estimated_profit_lamports > 0).length,
      validation_failed_count: results.filter(r => (r.validation_errors?.length ?? 0) > 0).length,
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
