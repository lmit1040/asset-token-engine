import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ethers } from "https://esm.sh/ethers@6.13.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Network RPC URLs - Mainnets and Testnets
const NETWORK_RPC_URLS: Record<string, string> = {
  // Mainnets
  POLYGON: "https://polygon-rpc.com",
  ETHEREUM: "https://eth.llamarpc.com",
  ARBITRUM: "https://arb1.arbitrum.io/rpc",
  BSC: "https://bsc-dataseed1.binance.org",
  // Testnets
  SEPOLIA: "https://ethereum-sepolia-rpc.publicnode.com",
  POLYGON_AMOY: "https://rpc-amoy.polygon.technology",
  ARBITRUM_SEPOLIA: "https://sepolia-rollup.arbitrum.io/rpc",
  BSC_TESTNET: "https://data-seed-prebsc-1-s1.binance.org:8545",
};

const CHAIN_IDS: Record<string, number> = {
  // Mainnets
  POLYGON: 137,
  ETHEREUM: 1,
  ARBITRUM: 42161,
  BSC: 56,
  // Testnets
  SEPOLIA: 11155111,
  POLYGON_AMOY: 80002,
  ARBITRUM_SEPOLIA: 421614,
  BSC_TESTNET: 97,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[refresh-evm-fee-payer-balances] Starting balance refresh...');

    // Verify admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // Parse optional network filter from request
    let targetNetwork: string | null = null;
    try {
      const body = await req.json();
      targetNetwork = body.network?.toUpperCase() || null;
    } catch {
      // No body or invalid JSON, refresh all networks
    }

    // Fetch all EVM fee payers
    let query = supabase
      .from('evm_fee_payer_keys')
      .select('id, public_key, label, network, is_active, balance_native');
    
    if (targetNetwork) {
      query = query.eq('network', targetNetwork);
    }

    const { data: feePayers, error: fetchError } = await query;

    if (fetchError) {
      console.error('[refresh-evm-fee-payer-balances] Failed to fetch fee payers:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch fee payers' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!feePayers || feePayers.length === 0) {
      console.log('[refresh-evm-fee-payer-balances] No EVM fee payers found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No fee payers to refresh',
        updated: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[refresh-evm-fee-payer-balances] Found ${feePayers.length} fee payers to refresh`);

    // Group fee payers by network for efficient RPC calls
    const feePayersByNetwork: Record<string, typeof feePayers> = {};
    for (const fp of feePayers) {
      const network = fp.network || 'POLYGON';
      if (!feePayersByNetwork[network]) {
        feePayersByNetwork[network] = [];
      }
      feePayersByNetwork[network].push(fp);
    }

    const results: Array<{
      id: string;
      public_key: string;
      network: string;
      old_balance: number | null;
      new_balance: number;
      success: boolean;
      error?: string;
    }> = [];

    // Process each network
    for (const [network, networkFeePayers] of Object.entries(feePayersByNetwork)) {
      const rpcUrl = NETWORK_RPC_URLS[network];
      const chainId = CHAIN_IDS[network];

      if (!rpcUrl || !chainId) {
        console.error(`[refresh-evm-fee-payer-balances] Unsupported network: ${network}`);
        for (const fp of networkFeePayers) {
          results.push({
            id: fp.id,
            public_key: fp.public_key,
            network,
            old_balance: fp.balance_native,
            new_balance: 0,
            success: false,
            error: `Unsupported network: ${network}`,
          });
        }
        continue;
      }

      console.log(`[refresh-evm-fee-payer-balances] Connecting to ${network}...`);
      const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);

      // Fetch balances for all fee payers on this network
      for (const fp of networkFeePayers) {
        try {
          const balanceWei = await provider.getBalance(fp.public_key);
          const balanceNative = parseFloat(ethers.formatEther(balanceWei));

          // Update in database
          const { error: updateError } = await supabase
            .from('evm_fee_payer_keys')
            .update({ balance_native: balanceNative })
            .eq('id', fp.id);

          if (updateError) {
            console.error(`[refresh-evm-fee-payer-balances] Failed to update ${fp.public_key}:`, updateError);
            results.push({
              id: fp.id,
              public_key: fp.public_key,
              network,
              old_balance: fp.balance_native,
              new_balance: balanceNative,
              success: false,
              error: 'Database update failed',
            });
          } else {
            console.log(`[refresh-evm-fee-payer-balances] Updated ${fp.label}: ${fp.balance_native} -> ${balanceNative}`);
            results.push({
              id: fp.id,
              public_key: fp.public_key,
              network,
              old_balance: fp.balance_native,
              new_balance: balanceNative,
              success: true,
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[refresh-evm-fee-payer-balances] Failed to fetch balance for ${fp.public_key}:`, errorMsg);
          results.push({
            id: fp.id,
            public_key: fp.public_key,
            network,
            old_balance: fp.balance_native,
            new_balance: 0,
            success: false,
            error: errorMsg,
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[refresh-evm-fee-payer-balances] Completed: ${successCount} success, ${failCount} failed`);

    return new Response(JSON.stringify({
      success: true,
      message: `Refreshed ${successCount} fee payer balances`,
      updated: successCount,
      failed: failCount,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[refresh-evm-fee-payer-balances] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
