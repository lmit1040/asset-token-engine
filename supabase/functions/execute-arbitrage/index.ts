import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// TODO: Import OPS wallet helper when implementing real execution
// import { getOpsWalletKeypair } from "../_shared/ops-wallet.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('[execute-arbitrage] Starting arbitrage execution (STUB)...');

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { strategy_id } = await req.json();
    if (!strategy_id) {
      return new Response(JSON.stringify({ error: 'strategy_id is required' }), {
        status: 400,
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
      console.error('[execute-arbitrage] Auth error:', authError);
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
      console.error('[execute-arbitrage] User is not admin:', user.id);
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[execute-arbitrage] Admin verified, looking up strategy: ${strategy_id}`);

    // Fetch the strategy
    const { data: strategy, error: stratError } = await supabase
      .from('arbitrage_strategies')
      .select('*')
      .eq('id', strategy_id)
      .eq('is_enabled', true)
      .maybeSingle();

    if (stratError || !strategy) {
      console.error('[execute-arbitrage] Strategy not found or disabled:', strategy_id);
      return new Response(JSON.stringify({ error: 'Strategy not found or disabled' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[execute-arbitrage] Found strategy: ${strategy.name}`);

    // Look up the most recent SIMULATED run for this strategy
    const { data: lastSimulation, error: simError } = await supabase
      .from('arbitrage_runs')
      .select('*')
      .eq('strategy_id', strategy_id)
      .eq('status', 'SIMULATED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (simError) {
      console.warn('[execute-arbitrage] Error fetching last simulation:', simError);
    }

    const estimatedProfit = lastSimulation?.estimated_profit_lamports || 0;
    console.log(`[execute-arbitrage] Last simulation profit: ${estimatedProfit} lamports`);

    // TODO: Real arbitrage execution logic goes here
    // In production, this would:
    // 1. const keypair = getOpsWalletKeypair();
    // 2. Connect to Solana RPC
    // 3. Check OPS_WALLET balance
    // 4. Construct flash loan transaction (if using flash loans)
    // 5. Build DEX A swap instruction (token_in -> token_out)
    // 6. Build DEX B swap instruction (token_out -> token_in)
    // 7. Combine into single atomic transaction
    // 8. Sign and send transaction
    // 9. Wait for confirmation
    // 10. Measure actual balance difference for actual_profit_lamports
    // 11. Handle errors and rollback scenarios

    const startedAt = new Date().toISOString();
    const finishedAt = new Date().toISOString();

    // STUB: Create a new run with EXECUTED status but no real transaction
    const { data: runData, error: runError } = await supabase
      .from('arbitrage_runs')
      .insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: finishedAt,
        status: 'EXECUTED',
        estimated_profit_lamports: estimatedProfit,
        actual_profit_lamports: 0, // No real execution yet
        tx_signature: null, // No real transaction
        error_message: 'STUB_EXECUTION_ONLY - no on-chain trades performed',
      })
      .select()
      .single();

    if (runError) {
      console.error('[execute-arbitrage] Failed to insert run:', runError);
      throw new Error('Failed to create execution run record');
    }

    console.log(`[execute-arbitrage] Created STUB execution run: ${runData.id}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'STUB EXECUTION - No real on-chain trades were performed',
      warning: 'This is a stub implementation. Real arbitrage logic is not yet implemented.',
      run_id: runData.id,
      strategy_name: strategy.name,
      estimated_profit_lamports: estimatedProfit,
      actual_profit_lamports: 0,
      tx_signature: null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[execute-arbitrage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
