import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ArbitrageRun {
  id: string;
  strategy_id: string;
  status: string;
  estimated_profit_lamports: number;
  estimated_gas_cost_native: number;
  purpose: string;
  approved_for_auto_execution: boolean;
}

interface ArbitrageStrategy {
  id: string;
  name: string;
  chain_type: string;
  evm_network: string | null;
  token_in_mint: string;
  token_out_mint: string;
  dex_a: string;
  dex_b: string;
  is_for_fee_payer_refill: boolean;
  is_for_ops_refill: boolean;
  min_expected_profit_native: number;
  max_daily_loss_native: number;
  use_flash_loan: boolean;
  flash_loan_provider: string | null;
  flash_loan_token: string | null;
  flash_loan_amount_native: number | null;
}

interface ExecutionResult {
  run_id: string;
  success: boolean;
  tx_signature?: string;
  pre_balance?: number;
  post_balance?: number;
  gas_cost?: number;
  pnl?: number;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[arb-auto-execute] Starting auto-execution engine...');

    // Step 1: Check system settings
    const { data: settingsData, error: settingsError } = await supabase
      .rpc('get_system_settings');

    if (settingsError) {
      throw new Error('Failed to get system settings');
    }

    const settings = settingsData;

    if (!settings.auto_arbitrage_enabled) {
      console.log('[arb-auto-execute] Auto arbitrage disabled. Exiting.');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Auto arbitrage disabled',
        executed_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (settings.safe_mode_enabled) {
      console.log('[arb-auto-execute] Safe mode enabled. Exiting.');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Safe mode enabled - no auto-execution',
        executed_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Find approved runs
    const { data: approvedRuns, error: runsError } = await supabase
      .from('arbitrage_runs')
      .select('*')
      .eq('approved_for_auto_execution', true)
      .eq('status', 'SIMULATED')
      .order('created_at', { ascending: true })
      .limit(10); // Process max 10 at a time

    if (runsError) {
      throw new Error('Failed to fetch approved runs');
    }

    if (!approvedRuns || approvedRuns.length === 0) {
      console.log('[arb-auto-execute] No approved runs to execute.');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No approved runs to execute',
        executed_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[arb-auto-execute] Found ${approvedRuns.length} approved runs to execute`);

    const results: ExecutionResult[] = [];
    const today = new Date().toISOString().split('T')[0];
    let totalPnl = 0;
    let safeModeTriggered = false;

    // Step 3: Execute each approved run
    for (const run of approvedRuns as ArbitrageRun[]) {
      console.log(`[arb-auto-execute] Processing run ${run.id}...`);

      // Fetch strategy
      const { data: strategy, error: stratError } = await supabase
        .from('arbitrage_strategies')
        .select('*')
        .eq('id', run.strategy_id)
        .maybeSingle();

      if (stratError || !strategy) {
        console.error(`[arb-auto-execute] Strategy not found for run ${run.id}`);
        results.push({ run_id: run.id, success: false, error: 'Strategy not found' });
        continue;
      }

      const strat = strategy as ArbitrageStrategy;

      try {
        // Call the appropriate execution function based on chain type
        let executionResult: ExecutionResult;

        if (strat.chain_type === 'SOLANA') {
          executionResult = await executeSolanaArbitrage(supabase, run, strat);
        } else if (strat.chain_type === 'EVM') {
          executionResult = await executeEvmArbitrage(supabase, run, strat);
        } else {
          throw new Error(`Unsupported chain type: ${strat.chain_type}`);
        }

        results.push(executionResult);

        // Update the run record
        await supabase
          .from('arbitrage_runs')
          .update({
            status: executionResult.success ? 'EXECUTED' : 'FAILED',
            auto_executed: true,
            actual_profit_lamports: executionResult.pnl || 0,
            tx_signature: executionResult.tx_signature || null,
            error_message: executionResult.error || null,
            finished_at: new Date().toISOString(),
          })
          .eq('id', run.id);

        // Update daily risk limits
        const pnl = executionResult.pnl || 0;
        totalPnl += pnl;

        await updateDailyRiskLimits(supabase, strat.id, strat.chain_type, today, pnl);

        // Check for refill request fulfillment
        if (executionResult.success && (strat.is_for_fee_payer_refill || strat.is_for_ops_refill)) {
          await fulfillRefillRequests(supabase, strat.chain_type, run.id);
        }

        // Step 4: Check if we need to trigger safe mode
        if (pnl < 0) {
          const loss = Math.abs(pnl);
          
          // Check per-strategy loss limit
          if (strat.max_daily_loss_native > 0 && loss > strat.max_daily_loss_native) {
            console.log(`[arb-auto-execute] Strategy ${strat.id} exceeded daily loss limit!`);
            safeModeTriggered = true;
          }

          // Check global loss limit
          if (settings.max_global_daily_loss_native > 0) {
            const { data: dailyStats } = await supabase
              .from('daily_risk_limits')
              .select('total_loss_native')
              .eq('date', today);

            const totalDailyLoss = (dailyStats || []).reduce((sum: number, r: any) => sum + (r.total_loss_native || 0), 0);
            
            if (totalDailyLoss >= settings.max_global_daily_loss_native) {
              console.log(`[arb-auto-execute] Global daily loss limit exceeded!`);
              safeModeTriggered = true;
            }
          }
        }

      } catch (execError: unknown) {
        const errorMsg = execError instanceof Error ? execError.message : 'Unknown execution error';
        console.error(`[arb-auto-execute] Execution failed for run ${run.id}:`, errorMsg);
        
        results.push({ run_id: run.id, success: false, error: errorMsg });

        // Mark run as failed
        await supabase
          .from('arbitrage_runs')
          .update({
            status: 'FAILED',
            auto_executed: true,
            error_message: errorMsg,
            finished_at: new Date().toISOString(),
          })
          .eq('id', run.id);
      }
    }

    // Step 4: Trigger safe mode if needed
    if (safeModeTriggered) {
      console.log('[arb-auto-execute] TRIGGERING SAFE MODE');
      await supabase
        .from('system_settings')
        .update({
          safe_mode_enabled: true,
          safe_mode_triggered_at: new Date().toISOString(),
          safe_mode_reason: 'Auto-triggered due to loss threshold breach',
        })
        .eq('id', '00000000-0000-0000-0000-000000000001');
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    const response = {
      success: true,
      message: `Executed ${successCount} trades, ${failCount} failed`,
      executed_count: successCount,
      failed_count: failCount,
      total_pnl: totalPnl,
      safe_mode_triggered: safeModeTriggered,
      results,
    };

    console.log('[arb-auto-execute] Execution complete:', JSON.stringify(response));

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[arb-auto-execute] Error:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Execute Solana arbitrage by calling the existing execute-arbitrage function
 */
async function executeSolanaArbitrage(
  supabase: any,
  run: ArbitrageRun,
  strategy: ArbitrageStrategy
): Promise<ExecutionResult> {
  console.log(`[arb-auto-execute] Executing Solana arbitrage for strategy ${strategy.name}...`);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Call the existing execute-arbitrage function
  const response = await fetch(`${supabaseUrl}/functions/v1/execute-arbitrage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      strategyId: strategy.id,
      autoExecution: true,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Solana arbitrage execution failed');
  }

  return {
    run_id: run.id,
    success: true,
    tx_signature: result.tx_signature,
    pnl: result.profit_lamports || 0,
  };
}

/**
 * Execute EVM arbitrage by calling the existing execute-evm-arbitrage function
 */
async function executeEvmArbitrage(
  supabase: any,
  run: ArbitrageRun,
  strategy: ArbitrageStrategy
): Promise<ExecutionResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Determine which execution function to call based on flash loan config
  const useFlashLoan = strategy.use_flash_loan && strategy.flash_loan_provider;
  const functionName = useFlashLoan ? 'execute-evm-flash-arbitrage' : 'execute-evm-arbitrage';
  
  console.log(`[arb-auto-execute] Executing EVM arbitrage for strategy ${strategy.name} on ${strategy.evm_network}...`);
  console.log(`[arb-auto-execute] Mode: ${useFlashLoan ? 'FLASH LOAN' : 'STANDARD'}, Function: ${functionName}`);

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      strategy_id: strategy.id,
      strategyId: strategy.id, // Support both formats
      autoExecution: true,
      simulate_only: false,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || result.message || 'EVM arbitrage execution failed');
  }

  // Handle different response formats from flash loan vs standard execution
  const txSignature = result.tx_hash || result.tx_signatures?.join(',') || result.txHash;
  const profitWei = result.profit_wei || result.net_profit || result.actual_profit;
  
  return {
    run_id: run.id,
    success: true,
    tx_signature: txSignature,
    pnl: profitWei ? Number(BigInt(profitWei) / BigInt(1e9)) : 0, // Convert to gwei
  };
}

/**
 * Update daily risk limits after execution
 */
async function updateDailyRiskLimits(
  supabase: any,
  strategyId: string,
  chain: string,
  date: string,
  pnl: number
): Promise<void> {
  // Try to get existing record
  const { data: existing, error: fetchError } = await supabase
    .from('daily_risk_limits')
    .select('*')
    .eq('strategy_id', strategyId)
    .eq('date', date)
    .maybeSingle();

  if (existing) {
    // Update existing record
    const newTotalTrades = (existing.total_trades || 0) + 1;
    const newTotalPnl = (existing.total_pnl_native || 0) + pnl;
    const newTotalLoss = pnl < 0 
      ? (existing.total_loss_native || 0) + Math.abs(pnl)
      : existing.total_loss_native || 0;

    await supabase
      .from('daily_risk_limits')
      .update({
        total_trades: newTotalTrades,
        total_pnl_native: newTotalPnl,
        total_loss_native: newTotalLoss,
      })
      .eq('id', existing.id);
  } else {
    // Insert new record
    await supabase
      .from('daily_risk_limits')
      .insert({
        strategy_id: strategyId,
        chain: chain,
        date: date,
        total_trades: 1,
        total_pnl_native: pnl,
        total_loss_native: pnl < 0 ? Math.abs(pnl) : 0,
      });
  }

  console.log(`[arb-auto-execute] Updated daily risk limits for strategy ${strategyId}`);
}

/**
 * Mark pending refill requests as fulfilled
 */
async function fulfillRefillRequests(
  supabase: any,
  chain: string,
  runId: string
): Promise<void> {
  const { data: pendingRequests, error } = await supabase
    .from('wallet_refill_requests')
    .select('id')
    .eq('status', 'PENDING')
    .eq('chain', chain)
    .limit(1);

  if (!error && pendingRequests && pendingRequests.length > 0) {
    await supabase
      .from('wallet_refill_requests')
      .update({
        status: 'FULFILLED',
        fulfilled_at: new Date().toISOString(),
        fulfilled_by_run_id: runId,
      })
      .eq('id', pendingRequests[0].id);

    console.log(`[arb-auto-execute] Marked refill request ${pendingRequests[0].id} as FULFILLED`);
  }
}
