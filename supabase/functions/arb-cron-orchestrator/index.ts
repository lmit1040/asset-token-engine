import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StepResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Create log entry at start
  const { data: logEntry, error: logError } = await supabase
    .from('automation_logs')
    .insert({
      trigger_type: 'cron',
      overall_status: 'RUNNING',
    })
    .select()
    .single();

  if (logError) {
    console.error('[arb-cron-orchestrator] Failed to create log entry:', logError);
  }

  const logId = logEntry?.id;

  try {
    console.log('[arb-cron-orchestrator] Starting automated arbitrage cycle...');

    // Step 0: Check if automation is enabled
    const { data: settingsData, error: settingsError } = await supabase
      .rpc('get_system_settings');

    if (settingsError) {
      throw new Error('Failed to get system settings');
    }

    if (!settingsData.auto_arbitrage_enabled) {
      console.log('[arb-cron-orchestrator] Auto arbitrage is disabled. Skipping cycle.');
      
      if (logId) {
        await supabase.from('automation_logs').update({
          cycle_finished_at: new Date().toISOString(),
          overall_status: 'SKIPPED',
          error_message: 'Auto arbitrage is disabled',
        }).eq('id', logId);
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Auto arbitrage is disabled - cycle skipped',
        status: 'SKIPPED',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (settingsData.safe_mode_enabled) {
      console.log('[arb-cron-orchestrator] Safe mode is enabled. Skipping execution (scans will still run).');
    }

    // ============ STEP 1: SCAN FOR OPPORTUNITIES ============
    console.log('[arb-cron-orchestrator] Step 1: Scanning for opportunities...');
    
    let scanSolanaResult: StepResult = { success: false };
    let scanEvmResult: StepResult = { success: false };

    // Scan Solana (uses mock due to Jupiter DNS limitations)
    try {
      const solanaResponse = await fetch(`${supabaseUrl}/functions/v1/scan-arbitrage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ forceMock: true }), // Use mock for reliability
      });
      const solanaData = await solanaResponse.json();
      scanSolanaResult = { success: solanaResponse.ok, data: solanaData };
      console.log(`[arb-cron-orchestrator] Solana scan: ${solanaData?.simulations?.length || 0} opportunities`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      scanSolanaResult = { success: false, error: errMsg };
      console.error('[arb-cron-orchestrator] Solana scan failed:', errMsg);
    }

    // Scan EVM
    try {
      const evmResponse = await fetch(`${supabaseUrl}/functions/v1/scan-evm-arbitrage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      });
      const evmData = await evmResponse.json();
      scanEvmResult = { success: evmResponse.ok, data: evmData };
      console.log(`[arb-cron-orchestrator] EVM scan: ${evmData?.simulations?.length || 0} opportunities`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      scanEvmResult = { success: false, error: errMsg };
      console.error('[arb-cron-orchestrator] EVM scan failed:', errMsg);
    }

    // Update log with scan results
    if (logId) {
      await supabase.from('automation_logs').update({
        scan_solana_result: scanSolanaResult,
        scan_evm_result: scanEvmResult,
      }).eq('id', logId);
    }

    // Short delay to allow scans to complete database writes
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ============ STEP 2: RUN DECISION ENGINE ============
    console.log('[arb-cron-orchestrator] Step 2: Running decision engine...');
    
    let decisionResult: StepResult = { success: false };

    try {
      const decisionResponse = await fetch(`${supabaseUrl}/functions/v1/arb-auto-controller`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      });
      const decisionData = await decisionResponse.json();
      decisionResult = { success: decisionResponse.ok, data: decisionData };
      console.log(`[arb-cron-orchestrator] Decision engine: ${decisionData?.approved_count || 0} approved`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      decisionResult = { success: false, error: errMsg };
      console.error('[arb-cron-orchestrator] Decision engine failed:', errMsg);
    }

    // Update log with decision results
    if (logId) {
      await supabase.from('automation_logs').update({
        decision_result: decisionResult,
      }).eq('id', logId);
    }

    // Short delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // ============ STEP 3: RUN EXECUTION ENGINE ============
    console.log('[arb-cron-orchestrator] Step 3: Running execution engine...');
    
    let executionResult: StepResult = { success: false };

    // Skip execution if safe mode is enabled
    if (settingsData.safe_mode_enabled) {
      executionResult = { success: true, data: { skipped: true, reason: 'Safe mode enabled' } };
      console.log('[arb-cron-orchestrator] Execution skipped due to safe mode');
    } else {
      try {
        const executionResponse = await fetch(`${supabaseUrl}/functions/v1/arb-auto-execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
        });
        const executionData = await executionResponse.json();
        executionResult = { success: executionResponse.ok, data: executionData };
        console.log(`[arb-cron-orchestrator] Execution engine: ${executionData?.executed_count || 0} executed`);
        
        if (executionData?.safe_mode_triggered) {
          console.warn('[arb-cron-orchestrator] Safe mode was triggered during execution!');
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        executionResult = { success: false, error: errMsg };
        console.error('[arb-cron-orchestrator] Execution engine failed:', errMsg);
      }
    }

    // Update log with execution results
    if (logId) {
      await supabase.from('automation_logs').update({
        execution_result: executionResult,
      }).eq('id', logId);
    }

    // ============ STEP 4: CHECK WALLET BALANCES ============
    console.log('[arb-cron-orchestrator] Step 4: Checking wallet balances...');
    
    let walletCheckResult: StepResult = { success: false };

    try {
      // Refresh balances first
      await fetch(`${supabaseUrl}/functions/v1/refresh-fee-payer-balances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      });
      
      await fetch(`${supabaseUrl}/functions/v1/refresh-evm-fee-payer-balances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      });

      // Then check for low balances
      const walletResponse = await fetch(`${supabaseUrl}/functions/v1/wallet-auto-refill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      });
      const walletData = await walletResponse.json();
      walletCheckResult = { success: walletResponse.ok, data: walletData };
      console.log(`[arb-cron-orchestrator] Wallet check: ${walletData?.requests_created || 0} refill requests created`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      walletCheckResult = { success: false, error: errMsg };
      console.error('[arb-cron-orchestrator] Wallet check failed:', errMsg);
    }

    // ============ FINALIZE ============
    const allSuccess = scanSolanaResult.success && scanEvmResult.success && 
                       decisionResult.success && executionResult.success && walletCheckResult.success;
    const anySuccess = scanSolanaResult.success || scanEvmResult.success || 
                       decisionResult.success || executionResult.success || walletCheckResult.success;

    const overallStatus = allSuccess ? 'SUCCESS' : (anySuccess ? 'PARTIAL' : 'FAILED');

    // Update final log entry
    if (logId) {
      await supabase.from('automation_logs').update({
        cycle_finished_at: new Date().toISOString(),
        wallet_check_result: walletCheckResult,
        overall_status: overallStatus,
      }).eq('id', logId);
    }

    const response = {
      success: true,
      status: overallStatus,
      log_id: logId,
      steps: {
        scan_solana: scanSolanaResult,
        scan_evm: scanEvmResult,
        decision: decisionResult,
        execution: executionResult,
        wallet_check: walletCheckResult,
      },
      summary: {
        solana_opportunities: (scanSolanaResult.data as any)?.simulations?.length || 0,
        evm_opportunities: (scanEvmResult.data as any)?.simulations?.length || 0,
        approved: (decisionResult.data as any)?.approved_count || 0,
        executed: (executionResult.data as any)?.executed_count || 0,
        refill_requests: (walletCheckResult.data as any)?.requests_created || 0,
      },
    };

    console.log('[arb-cron-orchestrator] Cycle complete:', JSON.stringify(response.summary));

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[arb-cron-orchestrator] Critical error:', errorMessage);

    // Update log with error
    if (logId) {
      await supabase.from('automation_logs').update({
        cycle_finished_at: new Date().toISOString(),
        overall_status: 'FAILED',
        error_message: errorMessage,
      }).eq('id', logId);
    }

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      log_id: logId,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
