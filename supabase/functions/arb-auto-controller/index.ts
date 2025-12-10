import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SystemSettings {
  auto_arbitrage_enabled: boolean;
  safe_mode_enabled: boolean;
  max_global_daily_loss_native: number;
  max_global_trades_per_day: number;
}

interface ArbitrageStrategy {
  id: string;
  is_auto_enabled: boolean;
  is_for_fee_payer_refill: boolean;
  is_for_ops_refill: boolean;
  min_expected_profit_native: number;
  min_profit_to_gas_ratio: number;
  max_daily_loss_native: number;
  max_trades_per_day: number;
  chain_type: string;
}

interface ArbitrageRun {
  id: string;
  strategy_id: string;
  status: string;
  estimated_profit_lamports: number;
  estimated_gas_cost_native: number;
  purpose: string;
}

interface DailyRiskLimit {
  total_trades: number;
  total_loss_native: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[arb-auto-controller] Starting decision engine...');

    // Step 1: Read system settings
    const { data: settingsData, error: settingsError } = await supabase
      .rpc('get_system_settings');

    if (settingsError) {
      console.error('[arb-auto-controller] Failed to get system settings:', settingsError);
      throw new Error('Failed to get system settings');
    }

    const settings = settingsData as SystemSettings;

    // Check if automation is enabled
    if (!settings.auto_arbitrage_enabled) {
      console.log('[arb-auto-controller] Auto arbitrage is disabled. Exiting.');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Auto arbitrage is disabled',
        approved_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if safe mode is enabled
    if (settings.safe_mode_enabled) {
      console.log('[arb-auto-controller] Safe mode is enabled. Exiting.');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Safe mode is enabled - no auto-execution allowed',
        approved_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Fetch simulated runs that haven't been approved yet
    const { data: simulatedRuns, error: runsError } = await supabase
      .from('arbitrage_runs')
      .select('*')
      .eq('status', 'SIMULATED')
      .eq('approved_for_auto_execution', false)
      .order('created_at', { ascending: true });

    if (runsError) {
      console.error('[arb-auto-controller] Failed to fetch simulated runs:', runsError);
      throw new Error('Failed to fetch simulated runs');
    }

    if (!simulatedRuns || simulatedRuns.length === 0) {
      console.log('[arb-auto-controller] No simulated runs to process.');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No simulated runs to process',
        approved_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[arb-auto-controller] Found ${simulatedRuns.length} simulated runs to evaluate`);

    // Get today's date for daily limits
    const today = new Date().toISOString().split('T')[0];
    
    // Track approvals
    const approvedRunIds: string[] = [];
    const rejectionReasons: Record<string, string> = {};

    // Process each simulated run
    for (const run of simulatedRuns as ArbitrageRun[]) {
      console.log(`[arb-auto-controller] Evaluating run ${run.id}...`);

      // Fetch associated strategy
      const { data: strategy, error: strategyError } = await supabase
        .from('arbitrage_strategies')
        .select('*')
        .eq('id', run.strategy_id)
        .maybeSingle();

      if (strategyError || !strategy) {
        console.error(`[arb-auto-controller] Failed to fetch strategy for run ${run.id}`);
        rejectionReasons[run.id] = 'Strategy not found';
        continue;
      }

      const strat = strategy as ArbitrageStrategy;

      // Check 2a: Strategy auto-enabled
      if (!strat.is_auto_enabled) {
        console.log(`[arb-auto-controller] Run ${run.id}: Strategy auto-execution disabled`);
        rejectionReasons[run.id] = 'Strategy auto-execution disabled';
        continue;
      }

      // Check 2b: Profit threshold
      const estimatedProfit = Number(run.estimated_profit_lamports || 0);
      const minProfit = Number(strat.min_expected_profit_native || 0);
      
      if (estimatedProfit < minProfit) {
        console.log(`[arb-auto-controller] Run ${run.id}: Profit ${estimatedProfit} < min ${minProfit}`);
        rejectionReasons[run.id] = `Profit below threshold: ${estimatedProfit} < ${minProfit}`;
        continue;
      }

      // Check 2c: Profit to gas ratio
      const gasCost = Number(run.estimated_gas_cost_native || 1); // Avoid division by zero
      const profitToGasRatio = estimatedProfit / gasCost;
      const minRatio = Number(strat.min_profit_to_gas_ratio || 1);

      if (profitToGasRatio < minRatio) {
        console.log(`[arb-auto-controller] Run ${run.id}: Profit/gas ratio ${profitToGasRatio.toFixed(2)} < min ${minRatio}`);
        rejectionReasons[run.id] = `Profit/gas ratio too low: ${profitToGasRatio.toFixed(2)} < ${minRatio}`;
        continue;
      }

      // Check 3: Fee payer refill - verify there's a pending request
      if (strat.is_for_fee_payer_refill) {
        const { data: pendingRefills, error: refillError } = await supabase
          .from('wallet_refill_requests')
          .select('id')
          .eq('status', 'PENDING')
          .eq('chain', strat.chain_type)
          .limit(1);

        if (refillError || !pendingRefills || pendingRefills.length === 0) {
          console.log(`[arb-auto-controller] Run ${run.id}: No pending refill requests for chain ${strat.chain_type}`);
          rejectionReasons[run.id] = 'No pending refill requests';
          continue;
        }
      }

      // Check 4: Daily risk limits
      const { data: dailyLimits, error: limitsError } = await supabase
        .from('daily_risk_limits')
        .select('total_trades, total_loss_native')
        .eq('strategy_id', strat.id)
        .eq('date', today)
        .maybeSingle();

      const currentTrades = (dailyLimits as DailyRiskLimit)?.total_trades || 0;
      const currentLoss = (dailyLimits as DailyRiskLimit)?.total_loss_native || 0;

      // Check trades per day
      if (currentTrades >= strat.max_trades_per_day) {
        console.log(`[arb-auto-controller] Run ${run.id}: Daily trade limit reached (${currentTrades}/${strat.max_trades_per_day})`);
        rejectionReasons[run.id] = `Daily trade limit reached: ${currentTrades}/${strat.max_trades_per_day}`;
        continue;
      }

      // Check daily loss limit
      if (strat.max_daily_loss_native > 0 && currentLoss >= strat.max_daily_loss_native) {
        console.log(`[arb-auto-controller] Run ${run.id}: Daily loss limit reached (${currentLoss}/${strat.max_daily_loss_native})`);
        rejectionReasons[run.id] = `Daily loss limit reached: ${currentLoss}/${strat.max_daily_loss_native}`;
        continue;
      }

      // Check global limits
      // Get all trades today across all strategies
      const { data: globalStats, error: globalError } = await supabase
        .from('daily_risk_limits')
        .select('total_trades, total_loss_native')
        .eq('date', today);

      if (!globalError && globalStats) {
        const globalTrades = globalStats.reduce((sum, r) => sum + (r.total_trades || 0), 0);
        const globalLoss = globalStats.reduce((sum, r) => sum + (r.total_loss_native || 0), 0);

        if (globalTrades >= settings.max_global_trades_per_day) {
          console.log(`[arb-auto-controller] Run ${run.id}: Global daily trade limit reached`);
          rejectionReasons[run.id] = `Global daily trade limit reached: ${globalTrades}/${settings.max_global_trades_per_day}`;
          continue;
        }

        if (settings.max_global_daily_loss_native > 0 && globalLoss >= settings.max_global_daily_loss_native) {
          console.log(`[arb-auto-controller] Run ${run.id}: Global daily loss limit reached`);
          rejectionReasons[run.id] = `Global daily loss limit reached`;
          continue;
        }
      }

      // All checks passed - approve run
      console.log(`[arb-auto-controller] Run ${run.id}: APPROVED for auto-execution`);
      approvedRunIds.push(run.id);
    }

    // Step 5: Mark approved runs
    if (approvedRunIds.length > 0) {
      const { error: updateError } = await supabase
        .from('arbitrage_runs')
        .update({ approved_for_auto_execution: true })
        .in('id', approvedRunIds);

      if (updateError) {
        console.error('[arb-auto-controller] Failed to update approved runs:', updateError);
        throw new Error('Failed to mark runs as approved');
      }

      console.log(`[arb-auto-controller] Marked ${approvedRunIds.length} runs as approved`);
    }

    const result = {
      success: true,
      message: `Processed ${simulatedRuns.length} runs`,
      approved_count: approvedRunIds.length,
      approved_run_ids: approvedRunIds,
      rejected_count: Object.keys(rejectionReasons).length,
      rejection_reasons: rejectionReasons,
    };

    console.log('[arb-auto-controller] Decision engine complete:', JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[arb-auto-controller] Error:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
