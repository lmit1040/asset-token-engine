import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1.87.6";
import { getOpsWalletKeypair } from "../_shared/ops-wallet.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration (can be made configurable later)
const MIN_BALANCE_THRESHOLD_SOL = 0.05; // Top up if balance below this
const TOP_UP_AMOUNT_SOL = 0.2; // Amount to send when topping up
const SOLANA_RPC_URL = Deno.env.get('SOLANA_DEVNET_RPC_URL') || 'https://api.devnet.solana.com';

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
    console.log('[top-up-fee-payers] Starting fee payer top-up check...');

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
      console.error('[top-up-fee-payers] Auth error:', authError);
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
      console.error('[top-up-fee-payers] User is not admin:', user.id);
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[top-up-fee-payers] Admin verified, loading OPS wallet...');

    // Get OPS wallet keypair
    let opsWallet: Keypair;
    try {
      opsWallet = getOpsWalletKeypair();
    } catch (error) {
      console.error('[top-up-fee-payers] Failed to load OPS wallet:', error);
      const errorDetails = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ 
        error: 'OPS_WALLET not configured',
        details: errorDetails 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const opsWalletPubkey = opsWallet.publicKey.toBase58();
    console.log(`[top-up-fee-payers] OPS wallet loaded: ${opsWalletPubkey}`);

    // Connect to Solana
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    // Check OPS wallet balance
    const opsBalance = await connection.getBalance(opsWallet.publicKey);
    const opsBalanceSol = opsBalance / LAMPORTS_PER_SOL;
    console.log(`[top-up-fee-payers] OPS wallet balance: ${opsBalanceSol} SOL`);

    // Fetch active fee payers from database
    const { data: feePayers, error: fpError } = await supabase
      .from('fee_payer_keys')
      .select('*')
      .eq('is_active', true);

    if (fpError) {
      console.error('[top-up-fee-payers] Failed to fetch fee payers:', fpError);
      throw new Error('Failed to fetch fee payers');
    }

    console.log(`[top-up-fee-payers] Found ${feePayers?.length || 0} active fee payers`);

    const results = [];
    const topUpAmountLamports = Math.floor(TOP_UP_AMOUNT_SOL * LAMPORTS_PER_SOL);

    for (const feePayer of feePayers || []) {
      try {
        const feePayerPubkey = new PublicKey(feePayer.public_key);
        const balance = await connection.getBalance(feePayerPubkey);
        const balanceSol = balance / LAMPORTS_PER_SOL;

        console.log(`[top-up-fee-payers] ${feePayer.label}: ${balanceSol} SOL`);

        if (balanceSol < MIN_BALANCE_THRESHOLD_SOL) {
          console.log(`[top-up-fee-payers] ${feePayer.label} below threshold, sending ${TOP_UP_AMOUNT_SOL} SOL...`);

          // Check if OPS wallet has enough balance
          const currentOpsBalance = await connection.getBalance(opsWallet.publicKey);
          if (currentOpsBalance < topUpAmountLamports + 5000) { // 5000 lamports for fee
            console.error('[top-up-fee-payers] OPS wallet has insufficient balance');
            results.push({
              fee_payer: feePayer.label,
              public_key: feePayer.public_key,
              current_balance_sol: balanceSol,
              topped_up: false,
              error: 'OPS wallet has insufficient balance',
            });
            continue;
          }

          // Create and send transfer transaction
          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: opsWallet.publicKey,
              toPubkey: feePayerPubkey,
              lamports: topUpAmountLamports,
            })
          );

          const signature = await sendAndConfirmTransaction(connection, transaction, [opsWallet]);
          console.log(`[top-up-fee-payers] Transfer successful: ${signature}`);

          // Log the top-up in database
          const { error: logError } = await supabase
            .from('fee_payer_topups')
            .insert({
              fee_payer_public_key: feePayer.public_key,
              amount_lamports: topUpAmountLamports,
              tx_signature: signature,
            });

          if (logError) {
            console.warn('[top-up-fee-payers] Failed to log top-up:', logError);
          }

          // Update fee payer balance in database
          const newBalance = await connection.getBalance(feePayerPubkey);
          await supabase
            .from('fee_payer_keys')
            .update({ balance_sol: newBalance / LAMPORTS_PER_SOL })
            .eq('id', feePayer.id);

          results.push({
            fee_payer: feePayer.label,
            public_key: feePayer.public_key,
            previous_balance_sol: balanceSol,
            topped_up: true,
            amount_sol: TOP_UP_AMOUNT_SOL,
            new_balance_sol: newBalance / LAMPORTS_PER_SOL,
            tx_signature: signature,
          });
        } else {
          results.push({
            fee_payer: feePayer.label,
            public_key: feePayer.public_key,
            current_balance_sol: balanceSol,
            topped_up: false,
            reason: 'Balance above threshold',
          });
        }
      } catch (error) {
        console.error(`[top-up-fee-payers] Error processing ${feePayer.label}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          fee_payer: feePayer.label,
          public_key: feePayer.public_key,
          topped_up: false,
          error: errorMessage,
        });
      }
    }

    const toppedUpCount = results.filter(r => r.topped_up).length;
    console.log(`[top-up-fee-payers] Complete. Topped up ${toppedUpCount} of ${results.length} fee payers.`);

    return new Response(JSON.stringify({
      success: true,
      message: `Topped up ${toppedUpCount} fee payers`,
      ops_wallet: opsWalletPubkey,
      ops_wallet_balance_sol: opsBalanceSol,
      threshold_sol: MIN_BALANCE_THRESHOLD_SOL,
      top_up_amount_sol: TOP_UP_AMOUNT_SOL,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[top-up-fee-payers] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
