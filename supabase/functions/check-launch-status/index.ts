import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DetectionResult {
  itemId: string;
  isComplete: boolean;
  reason: string;
  detectedValue?: string | number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: DetectionResult[] = [];

    // ========== CHECK SECRETS ==========
    const secretChecks = [
      { itemId: 'new-fee-payer-encryption-key', secret: 'FEE_PAYER_ENCRYPTION_KEY' },
      { itemId: 'new-ops-wallet-keys', secret: 'OPS_WALLET_SECRET_KEY' },
      { itemId: 'verify-resend-api-production', secret: 'RESEND_API_KEY' },
      { itemId: 'verify-pinata-production', secret: 'PINATA_JWT' },
      { itemId: 'mainnet-0x-api', secret: 'ZEROX_API_KEY' },
      { itemId: 'mainnet-rpc-solana', secret: 'SOLANA_MAINNET_RPC_URL' },
    ];

    for (const check of secretChecks) {
      const secretValue = Deno.env.get(check.secret);
      results.push({
        itemId: check.itemId,
        isComplete: !!secretValue && secretValue.length > 0,
        reason: secretValue ? `${check.secret} is configured` : `${check.secret} is not set`,
      });
    }

    // Check EVM_OPS_PRIVATE_KEY separately (part of new-ops-wallet-keys)
    const evmOpsKey = Deno.env.get('EVM_OPS_PRIVATE_KEY');
    const opsWalletResult = results.find(r => r.itemId === 'new-ops-wallet-keys');
    if (opsWalletResult) {
      const solanaOps = Deno.env.get('OPS_WALLET_SECRET_KEY');
      opsWalletResult.isComplete = !!solanaOps && !!evmOpsKey;
      opsWalletResult.reason = 
        solanaOps && evmOpsKey ? 'Both OPS wallet keys configured' :
        solanaOps ? 'Only Solana OPS key configured' :
        evmOpsKey ? 'Only EVM OPS key configured' :
        'No OPS wallet keys configured';
    }

    // ========== SYSTEM SETTINGS ==========
    const { data: settings } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    // is_mainnet_mode check
    results.push({
      itemId: 'remove-mock-mode',
      isComplete: settings?.is_mainnet_mode === true,
      reason: settings?.is_mainnet_mode ? 'Mainnet mode enabled' : 'Still in testnet mode',
      detectedValue: settings?.is_mainnet_mode ? 'Enabled' : 'Disabled',
    });

    // safe mode thresholds
    results.push({
      itemId: 'configure-safe-mode-mainnet',
      isComplete: (settings?.max_global_daily_loss_native || 0) > 0,
      reason: settings?.max_global_daily_loss_native > 0 
        ? `Max daily loss set to ${settings.max_global_daily_loss_native}` 
        : 'Max daily loss not configured',
      detectedValue: settings?.max_global_daily_loss_native || 0,
    });

    // refill thresholds
    const hasRefillThresholds = 
      (settings?.mainnet_min_fee_payer_balance_sol || 0) > 0 &&
      (settings?.mainnet_fee_payer_top_up_sol || 0) > 0;
    results.push({
      itemId: 'verify-refill-thresholds',
      isComplete: hasRefillThresholds,
      reason: hasRefillThresholds 
        ? `Min: ${settings?.mainnet_min_fee_payer_balance_sol} SOL, Top-up: ${settings?.mainnet_fee_payer_top_up_sol} SOL`
        : 'Refill thresholds not configured',
    });

    // ========== FEE PAYERS ==========
    const { count: solanaFeePayerCount } = await supabase
      .from('fee_payer_keys')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    results.push({
      itemId: 'generate-mainnet-solana-fee-payers',
      isComplete: (solanaFeePayerCount || 0) > 0,
      reason: solanaFeePayerCount 
        ? `${solanaFeePayerCount} active Solana fee payers` 
        : 'No active Solana fee payers',
      detectedValue: solanaFeePayerCount || 0,
    });

    const { count: evmFeePayerCount } = await supabase
      .from('evm_fee_payer_keys')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    results.push({
      itemId: 'generate-mainnet-evm-fee-payers',
      isComplete: (evmFeePayerCount || 0) > 0,
      reason: evmFeePayerCount 
        ? `${evmFeePayerCount} active EVM fee payers` 
        : 'No active EVM fee payers',
      detectedValue: evmFeePayerCount || 0,
    });

    // ========== FLASH LOAN PROVIDERS ==========
    const { data: flashProviders } = await supabase
      .from('flash_loan_providers')
      .select('id, is_active, receiver_contract_address, chain')
      .eq('is_active', true);

    const activeWithReceiver = flashProviders?.filter(p => p.receiver_contract_address) || [];
    results.push({
      itemId: 'update-flash-loan-providers',
      isComplete: activeWithReceiver.length > 0,
      reason: activeWithReceiver.length > 0
        ? `${activeWithReceiver.length} providers with receiver contract`
        : 'No flash loan providers configured with receiver contract',
      detectedValue: activeWithReceiver.length,
    });

    // ========== ACTIVITY LOGGING ==========
    const { count: activityLogCount } = await supabase
      .from('activity_logs')
      .select('*', { count: 'exact', head: true });

    results.push({
      itemId: 'activity-logging',
      isComplete: (activityLogCount || 0) > 0,
      reason: activityLogCount 
        ? `${activityLogCount} activity logs recorded` 
        : 'No activity logs found',
      detectedValue: activityLogCount || 0,
    });

    // ========== RATE LIMITING ==========
    // Check if rate_limit_tracking table exists by trying to query it
    const { error: rateLimitError } = await supabase
      .from('rate_limit_tracking')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    results.push({
      itemId: 'rate-limiting',
      isComplete: !rateLimitError,
      reason: !rateLimitError 
        ? 'Rate limiting table exists and is functional' 
        : 'Rate limiting not configured',
    });

    // ========== ARBITRAGE STRATEGIES ==========
    const { data: strategies } = await supabase
      .from('arbitrage_strategies')
      .select('id, min_profit_to_gas_ratio, is_enabled');

    const enabledStrategies = strategies?.filter(s => s.is_enabled) || [];
    const properThresholdStrategies = enabledStrategies.filter(
      s => (s.min_profit_to_gas_ratio || 0) >= 3.0
    );

    results.push({
      itemId: 'update-strategy-thresholds',
      isComplete: enabledStrategies.length > 0 && 
        properThresholdStrategies.length === enabledStrategies.length,
      reason: enabledStrategies.length === 0
        ? 'No enabled strategies'
        : properThresholdStrategies.length === enabledStrategies.length
          ? `All ${enabledStrategies.length} strategies have proper thresholds (≥3.0)`
          : `${properThresholdStrategies.length}/${enabledStrategies.length} strategies have proper thresholds`,
      detectedValue: `${properThresholdStrategies.length}/${enabledStrategies.length}`,
    });

    // ========== TOKEN DEFINITIONS ==========
    const { data: tokens } = await supabase
      .from('token_definitions')
      .select('id, network, deployment_status, token_symbol')
      .is('archived_at', null);

    const mainnetTokens = tokens?.filter(
      t => t.network === 'MAINNET' && t.deployment_status === 'DEPLOYED'
    ) || [];

    const mxuMainnet = mainnetTokens.find(t => t.token_symbol === 'MXU');
    results.push({
      itemId: 'redeploy-mxu-mainnet',
      isComplete: !!mxuMainnet,
      reason: mxuMainnet 
        ? 'MXU deployed to mainnet' 
        : 'MXU not deployed to mainnet',
    });

    results.push({
      itemId: 'update-token-definitions',
      isComplete: mainnetTokens.length > 0,
      reason: mainnetTokens.length > 0
        ? `${mainnetTokens.length} tokens deployed to mainnet`
        : 'No tokens deployed to mainnet',
      detectedValue: mainnetTokens.length,
    });

    // Asset tokens check
    const assetTokenSymbols = ['GBX', 'MXS', 'MXC', 'GCX'];
    const deployedAssetTokens = mainnetTokens.filter(t => assetTokenSymbols.includes(t.token_symbol));
    results.push({
      itemId: 'redeploy-asset-tokens-mainnet',
      isComplete: deployedAssetTokens.length === assetTokenSymbols.length,
      reason: deployedAssetTokens.length === assetTokenSymbols.length
        ? 'All asset tokens deployed to mainnet'
        : `${deployedAssetTokens.length}/${assetTokenSymbols.length} asset tokens deployed`,
      detectedValue: `${deployedAssetTokens.length}/${assetTokenSymbols.length}`,
    });

    // ========== NDA SIGNATURES (for e2e auth testing indicator) ==========
    const { count: ndaCount } = await supabase
      .from('nda_signatures')
      .select('*', { count: 'exact', head: true });

    // This is just an indicator - not a full test
    results.push({
      itemId: 'e2e-auth-testing',
      isComplete: false, // Always requires manual verification
      reason: ndaCount 
        ? `${ndaCount} NDA signatures recorded (manual test still required)` 
        : 'No NDA signatures - auth flow may need testing',
      detectedValue: ndaCount || 0,
    });

    console.log(`Launch status check complete: ${results.length} items checked`);

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      checkedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error checking launch status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: 'Failed to check launch status',
      details: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
