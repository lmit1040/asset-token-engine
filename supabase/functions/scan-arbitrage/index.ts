import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[scan-arbitrage] Starting arbitrage simulation scan...');

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[scan-arbitrage] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // Fetch enabled strategies
    const { data: strategies, error: stratError } = await supabase
      .from('arbitrage_strategies')
      .select('*')
      .eq('is_enabled', true);

    if (stratError) {
      console.error('[scan-arbitrage] Failed to fetch strategies:', stratError);
      throw new Error('Failed to fetch strategies');
    }

    console.log(`[scan-arbitrage] Found ${strategies?.length || 0} enabled strategies`);

    const results = [];

    for (const strategy of strategies || []) {
      const startedAt = new Date().toISOString();
      console.log(`[scan-arbitrage] Simulating strategy: ${strategy.name}`);

      // TODO: Real DEX price fetching logic goes here
      // For now, we use placeholder/stub price simulation
      // In production, this would:
      // 1. Query DEX A (e.g., Raydium) for token_in -> token_out price
      // 2. Query DEX B (e.g., Orca) for token_out -> token_in price
      // 3. Calculate round-trip profit

      // Stub: Generate a random estimated profit for simulation
      const priceOnDexA = 1.0 + (Math.random() * 0.1 - 0.05); // 0.95 to 1.05
      const priceOnDexB = 1.0 + (Math.random() * 0.1 - 0.05); // 0.95 to 1.05
      
      // Simulate 1 SOL worth of input (1 billion lamports)
      const inputLamports = 1_000_000_000;
      
      // Calculate hypothetical round-trip
      const afterDexA = inputLamports * priceOnDexA;
      const afterDexB = afterDexA * priceOnDexB;
      const estimatedProfitLamports = Math.floor(afterDexB - inputLamports);

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
          error_message: null,
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
        token_in_mint: strategy.token_in_mint,
        token_out_mint: strategy.token_out_mint,
        estimated_profit_lamports: estimatedProfitLamports,
        estimated_profit_sol: estimatedProfitLamports / 1_000_000_000,
        meets_min_threshold: estimatedProfitLamports >= strategy.min_profit_lamports,
        run_id: runData?.id || null,
      });
    }

    console.log(`[scan-arbitrage] Scan complete. ${results.length} strategies simulated.`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Arbitrage simulation scan complete',
      simulations: results,
      total_strategies: results.length,
      profitable_count: results.filter(r => r.meets_min_threshold && r.estimated_profit_lamports > 0).length,
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
