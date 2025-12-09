import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Jupiter Quote API for real DEX price fetching
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
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
  contextSlot?: number;
  timeTaken?: number;
}

// Validate Solana base58 address format
function isValidSolanaAddress(address: string): boolean {
  // Solana addresses are base58-encoded, 32-44 characters
  // Valid base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

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
  'Jupiter', // Meta-DEX itself
]);

// Validate DEX name
function isValidDexName(dexName: string): { valid: boolean; suggestion?: string } {
  const normalizedInput = dexName.toLowerCase().trim();
  
  // Direct match
  for (const dex of SUPPORTED_DEXS) {
    if (dex.toLowerCase() === normalizedInput) {
      return { valid: true };
    }
  }
  
  // Partial match for suggestions
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

// Fetch quote from Jupiter API
async function fetchJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number = 50
): Promise<JupiterQuoteResponse | null> {
  try {
    const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
    console.log(`[scan-arbitrage] Fetching Jupiter quote: ${inputMint} -> ${outputMint}, amount: ${amountLamports}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[scan-arbitrage] Jupiter API error: ${response.status} - ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[scan-arbitrage] Jupiter quote received: outAmount=${data.outAmount}, routes=${data.routePlan?.length || 0}`);
    return data;
  } catch (error) {
    console.error(`[scan-arbitrage] Failed to fetch Jupiter quote:`, error);
    return null;
  }
}

// Get primary DEX used in a route
function getPrimaryDex(quote: JupiterQuoteResponse): string {
  if (!quote.routePlan || quote.routePlan.length === 0) return 'Unknown';
  
  // Find the DEX with highest percentage in the route
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

    // Extract JWT token from "Bearer <token>" format
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
      
      // Validate DEX names
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
        console.error(`[scan-arbitrage] Strategy ${strategy.name} has invalid addresses:`, validationErrors);
        
        // Log the failed validation as a run
        const { data: runData, error: runError } = await supabase
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
          })
          .select()
          .single();

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
          run_id: runData?.id || null,
          error: `Invalid Solana addresses: ${validationErrors.join('; ')}`,
          validation_errors: validationErrors,
        });
        continue;
      }

      console.log(`[scan-arbitrage] Token addresses validated successfully`);

      // Use 0.1 SOL worth as test input (100 million lamports = 0.1 SOL)
      const inputLamports = 100_000_000;
      
      let estimatedProfitLamports = 0;
      let priceSourceA = 'Jupiter';
      let priceSourceB = 'Jupiter';
      let dexUsedA = strategy.dex_a;
      let dexUsedB = strategy.dex_b;
      let quoteErrorA: string | null = null;
      let quoteErrorB: string | null = null;
      let outAmountA = 0;
      let outAmountB = 0;

      // Step 1: Get quote for token_in -> token_out (leg A)
      const quoteA = await fetchJupiterQuote(
        strategy.token_in_mint,
        strategy.token_out_mint,
        inputLamports
      );

      if (quoteA) {
        outAmountA = parseInt(quoteA.outAmount, 10);
        dexUsedA = getPrimaryDex(quoteA);
        console.log(`[scan-arbitrage] Leg A: ${inputLamports} -> ${outAmountA} via ${dexUsedA}`);

        // Step 2: Get quote for token_out -> token_in (leg B - round trip)
        const quoteB = await fetchJupiterQuote(
          strategy.token_out_mint,
          strategy.token_in_mint,
          outAmountA
        );

        if (quoteB) {
          outAmountB = parseInt(quoteB.outAmount, 10);
          dexUsedB = getPrimaryDex(quoteB);
          console.log(`[scan-arbitrage] Leg B: ${outAmountA} -> ${outAmountB} via ${dexUsedB}`);

          // Calculate round-trip profit
          estimatedProfitLamports = outAmountB - inputLamports;
          console.log(`[scan-arbitrage] Round-trip profit: ${estimatedProfitLamports} lamports (${(estimatedProfitLamports / 1_000_000_000).toFixed(6)} SOL)`);
        } else {
          quoteErrorB = 'Failed to fetch return leg quote from Jupiter';
          console.warn(`[scan-arbitrage] ${quoteErrorB}`);
        }
      } else {
        quoteErrorA = 'Failed to fetch initial leg quote from Jupiter';
        console.warn(`[scan-arbitrage] ${quoteErrorA}`);
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
          estimated_profit_lamports: estimatedProfitLamports,
          actual_profit_lamports: null,
          tx_signature: null,
          error_message: quoteErrorA || quoteErrorB || null,
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
        input_lamports: inputLamports,
        output_leg_a: outAmountA,
        output_leg_b: outAmountB,
        estimated_profit_lamports: estimatedProfitLamports,
        estimated_profit_sol: estimatedProfitLamports / 1_000_000_000,
        meets_min_threshold: estimatedProfitLamports >= strategy.min_profit_lamports,
        price_source: 'Jupiter Aggregator (Real DEX Prices)',
        run_id: runData?.id || null,
        error: quoteErrorA || quoteErrorB || null,
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
