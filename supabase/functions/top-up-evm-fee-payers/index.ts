import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ethers } from "https://esm.sh/ethers@6.13.2";
import { getEvmOpsWallet, getSupportedEvmNetworks } from "../_shared/evm-ops-wallet.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const MIN_BALANCE_THRESHOLD = 0.01; // Top up if balance below this (in native token)
const TOP_UP_AMOUNT_MAINNET = 0.05; // Amount to send on mainnets (in native token)
const TOP_UP_AMOUNT_TESTNET = 0.02; // Amount to send on testnets (in native token)

// Testnets list for configuration
const TESTNETS = ['SEPOLIA', 'POLYGON_AMOY', 'ARBITRUM_SEPOLIA', 'BSC_TESTNET'];

function getTopUpAmount(network: string): number {
  return TESTNETS.includes(network.toUpperCase()) ? TOP_UP_AMOUNT_TESTNET : TOP_UP_AMOUNT_MAINNET;
}

serve(async (req) => {
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
    console.log('[top-up-evm-fee-payers] Starting EVM fee payer top-up check...');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      console.error('[top-up-evm-fee-payers] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('[top-up-evm-fee-payers] User is not admin:', user.id);
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[top-up-evm-fee-payers] Admin verified');

    // Parse optional network filter from request body
    let targetNetwork: string | null = null;
    try {
      const body = await req.json();
      targetNetwork = body?.network?.toUpperCase() || null;
    } catch {
      // No body or invalid JSON, process all networks
    }

    const networks = targetNetwork ? [targetNetwork] : getSupportedEvmNetworks();
    const allResults: Record<string, unknown[]> = {};
    const opsWalletBalances: Record<string, string> = {};

    for (const network of networks) {
      console.log(`[top-up-evm-fee-payers] Processing network: ${network}`);

      let opsWallet;
      try {
        opsWallet = getEvmOpsWallet(network);
      } catch (error) {
        console.error(`[top-up-evm-fee-payers] Failed to load OPS wallet for ${network}:`, error);
        allResults[network] = [{ error: `OPS wallet not configured for ${network}` }];
        continue;
      }

      // Get OPS wallet balance
      const opsBalance = await opsWallet.provider.getBalance(opsWallet.address);
      const opsBalanceFormatted = ethers.formatEther(opsBalance);
      opsWalletBalances[network] = opsBalanceFormatted;
      console.log(`[top-up-evm-fee-payers] ${network} OPS wallet balance: ${opsBalanceFormatted}`);

      // Fetch active fee payers for this network
      const { data: feePayers, error: fpError } = await supabase
        .from('evm_fee_payer_keys')
        .select('*')
        .eq('is_active', true)
        .eq('network', network);

      if (fpError) {
        console.error(`[top-up-evm-fee-payers] Failed to fetch fee payers for ${network}:`, fpError);
        allResults[network] = [{ error: 'Failed to fetch fee payers' }];
        continue;
      }

      console.log(`[top-up-evm-fee-payers] Found ${feePayers?.length || 0} active fee payers for ${network}`);

      const networkResults = [];
      const topUpAmount = getTopUpAmount(network);
      const topUpAmountWei = ethers.parseEther(topUpAmount.toString());

      for (const feePayer of feePayers || []) {
        try {
          const balance = await opsWallet.provider.getBalance(feePayer.public_key);
          const balanceFormatted = parseFloat(ethers.formatEther(balance));

          console.log(`[top-up-evm-fee-payers] ${feePayer.label}: ${balanceFormatted}`);

          if (balanceFormatted < MIN_BALANCE_THRESHOLD) {
            console.log(`[top-up-evm-fee-payers] ${feePayer.label} below threshold, sending ${topUpAmount}...`);

            // Check if OPS wallet has enough balance
            const currentOpsBalance = await opsWallet.provider.getBalance(opsWallet.address);
            const estimatedGas = 21000n; // Standard transfer gas
            const feeData = await opsWallet.provider.getFeeData();
            const gasPrice = feeData.gasPrice || ethers.parseUnits('50', 'gwei');
            const gasCost = estimatedGas * gasPrice;

            if (currentOpsBalance < topUpAmountWei + gasCost) {
              console.error(`[top-up-evm-fee-payers] OPS wallet has insufficient balance on ${network}`);
              networkResults.push({
                fee_payer: feePayer.label,
                public_key: feePayer.public_key,
                current_balance: balanceFormatted,
                topped_up: false,
                error: 'OPS wallet has insufficient balance',
              });
              continue;
            }

            // Send transaction
            const tx = await opsWallet.wallet.sendTransaction({
              to: feePayer.public_key,
              value: topUpAmountWei,
            });

            console.log(`[top-up-evm-fee-payers] Transaction sent: ${tx.hash}`);

            // Wait for confirmation
            const receipt = await tx.wait();
            console.log(`[top-up-evm-fee-payers] Transaction confirmed: ${receipt?.hash}`);

            // Log the top-up in database
            const { error: logError } = await supabase
              .from('evm_fee_payer_topups')
              .insert({
                fee_payer_public_key: feePayer.public_key,
                amount_wei: topUpAmountWei.toString(),
                tx_hash: tx.hash,
                network: network,
              });

            if (logError) {
              console.warn('[top-up-evm-fee-payers] Failed to log top-up:', logError);
            }

            // Update fee payer balance in database
            const newBalance = await opsWallet.provider.getBalance(feePayer.public_key);
            await supabase
              .from('evm_fee_payer_keys')
              .update({ balance_native: parseFloat(ethers.formatEther(newBalance)) })
              .eq('id', feePayer.id);

            networkResults.push({
              fee_payer: feePayer.label,
              public_key: feePayer.public_key,
              previous_balance: balanceFormatted,
              topped_up: true,
              amount: topUpAmount,
              new_balance: parseFloat(ethers.formatEther(newBalance)),
              tx_hash: tx.hash,
            });
          } else {
            networkResults.push({
              fee_payer: feePayer.label,
              public_key: feePayer.public_key,
              current_balance: balanceFormatted,
              topped_up: false,
              reason: 'Balance above threshold',
            });
          }
        } catch (error) {
          console.error(`[top-up-evm-fee-payers] Error processing ${feePayer.label}:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          networkResults.push({
            fee_payer: feePayer.label,
            public_key: feePayer.public_key,
            topped_up: false,
            error: errorMessage,
          });
        }
      }

      allResults[network] = networkResults;
    }

    // Calculate summary
    let totalToppedUp = 0;
    let totalChecked = 0;
    for (const network in allResults) {
      const results = allResults[network] as { topped_up?: boolean }[];
      totalChecked += results.length;
      totalToppedUp += results.filter(r => r.topped_up).length;
    }

    console.log(`[top-up-evm-fee-payers] Complete. Topped up ${totalToppedUp} of ${totalChecked} fee payers across ${Object.keys(allResults).length} networks.`);

    return new Response(JSON.stringify({
      success: true,
      message: `Topped up ${totalToppedUp} fee payers across ${Object.keys(allResults).length} networks`,
      ops_wallet_balances: opsWalletBalances,
      threshold: MIN_BALANCE_THRESHOLD,
      top_up_amount: { mainnet: TOP_UP_AMOUNT_MAINNET, testnet: TOP_UP_AMOUNT_TESTNET },
      results: allResults,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[top-up-evm-fee-payers] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
