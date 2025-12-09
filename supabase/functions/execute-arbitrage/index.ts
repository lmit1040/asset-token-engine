import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Connection, VersionedTransaction } from "https://esm.sh/@solana/web3.js@1.87.6";
import { getOpsWalletKeypair } from "../_shared/ops-wallet.ts";
import { 
  getJupiterQuote, 
  getJupiterSwapTransaction, 
  JupiterApiError,
  isValidSolanaAddress 
} from "../_shared/jupiter-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default trade amount for arbitrage (in lamports for SOL-based pairs)
// TODO: Make this configurable per strategy
const DEFAULT_TRADE_AMOUNT_LAMPORTS = BigInt(100_000_000); // 0.1 SOL

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
    console.log('[execute-arbitrage] Starting real arbitrage execution...');

    // Get authorization header and extract JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[execute-arbitrage] No authorization header present');
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract JWT token from "Bearer <token>" format
    const jwt = authHeader.replace('Bearer ', '');
    console.log('[execute-arbitrage] JWT token received, length:', jwt.length);

    // Parse request body
    const { strategy_id } = await req.json();
    if (!strategy_id) {
      return new Response(JSON.stringify({ error: 'strategy_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user from JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      console.error('[execute-arbitrage] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('[execute-arbitrage] User verified:', user.id, user.email);

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

    // Validate token addresses
    if (!isValidSolanaAddress(strategy.token_in_mint) || !isValidSolanaAddress(strategy.token_out_mint)) {
      console.error('[execute-arbitrage] Invalid token mint addresses');
      return new Response(JSON.stringify({ error: 'Invalid token mint addresses in strategy' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get OPS_WALLET keypair
    let opsWallet;
    try {
      opsWallet = getOpsWalletKeypair();
      console.log('[execute-arbitrage] OPS_WALLET loaded:', opsWallet.publicKey.toBase58());
    } catch (error) {
      console.error('[execute-arbitrage] Failed to load OPS_WALLET:', error);
      return new Response(JSON.stringify({ error: 'OPS_WALLET not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Connect to Solana
    const rpcUrl = Deno.env.get('SOLANA_DEVNET_RPC_URL') || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    console.log('[execute-arbitrage] Connected to Solana RPC:', rpcUrl);

    const startedAt = new Date().toISOString();
    let txSignature: string | null = null;
    let actualProfitLamports = 0;
    let errorMessage: string | null = null;
    let status: 'EXECUTED' | 'FAILED' = 'EXECUTED';

    try {
      // Step 1: Get quote for first leg (token_in -> token_out)
      console.log('[execute-arbitrage] Getting quote for leg 1:', strategy.token_in_mint, '->', strategy.token_out_mint);
      const quote1 = await getJupiterQuote(
        strategy.token_in_mint,
        strategy.token_out_mint,
        DEFAULT_TRADE_AMOUNT_LAMPORTS,
        100 // 1% slippage
      );

      if (!quote1) {
        throw new Error('No route found for first leg');
      }

      console.log('[execute-arbitrage] Leg 1 quote: in=', quote1.inAmount, 'out=', quote1.outAmount);

      // Step 2: Get quote for second leg (token_out -> token_in)
      const leg2Amount = BigInt(quote1.outAmount);
      console.log('[execute-arbitrage] Getting quote for leg 2:', strategy.token_out_mint, '->', strategy.token_in_mint);
      const quote2 = await getJupiterQuote(
        strategy.token_out_mint,
        strategy.token_in_mint,
        leg2Amount,
        100 // 1% slippage
      );

      if (!quote2) {
        throw new Error('No route found for second leg');
      }

      console.log('[execute-arbitrage] Leg 2 quote: in=', quote2.inAmount, 'out=', quote2.outAmount);

      // Calculate estimated profit
      const estimatedProfit = BigInt(quote2.outAmount) - DEFAULT_TRADE_AMOUNT_LAMPORTS;
      console.log('[execute-arbitrage] Estimated profit (lamports):', estimatedProfit.toString());

      // Check if profit meets minimum threshold
      if (estimatedProfit < BigInt(strategy.min_profit_lamports)) {
        throw new Error(`Profit ${estimatedProfit} below minimum threshold ${strategy.min_profit_lamports}`);
      }

      // Step 3: Get swap transaction for first leg
      console.log('[execute-arbitrage] Getting swap transaction for leg 1...');
      const swap1 = await getJupiterSwapTransaction(quote1, opsWallet.publicKey.toBase58());
      if (!swap1) {
        throw new Error('Failed to get swap transaction for first leg');
      }

      // Step 4: Deserialize, sign, and send first leg transaction
      console.log('[execute-arbitrage] Sending leg 1 transaction...');
      const tx1Bytes = base64Decode(swap1.swapTransaction);
      const tx1 = VersionedTransaction.deserialize(tx1Bytes);
      tx1.sign([opsWallet]);

      const tx1Signature = await connection.sendRawTransaction(tx1.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      console.log('[execute-arbitrage] Leg 1 tx sent:', tx1Signature);

      // Wait for confirmation
      const tx1Confirmation = await connection.confirmTransaction({
        signature: tx1Signature,
        blockhash: tx1.message.recentBlockhash,
        lastValidBlockHeight: swap1.lastValidBlockHeight,
      }, 'confirmed');

      if (tx1Confirmation.value.err) {
        throw new Error(`Leg 1 transaction failed: ${JSON.stringify(tx1Confirmation.value.err)}`);
      }
      console.log('[execute-arbitrage] Leg 1 confirmed');

      // Step 5: Get fresh quote for second leg (prices may have changed)
      console.log('[execute-arbitrage] Getting fresh quote for leg 2...');
      const freshQuote2 = await getJupiterQuote(
        strategy.token_out_mint,
        strategy.token_in_mint,
        leg2Amount,
        100
      );

      if (!freshQuote2) {
        throw new Error('No route found for second leg after first leg execution');
      }

      // Step 6: Get swap transaction for second leg
      console.log('[execute-arbitrage] Getting swap transaction for leg 2...');
      const swap2 = await getJupiterSwapTransaction(freshQuote2, opsWallet.publicKey.toBase58());
      if (!swap2) {
        throw new Error('Failed to get swap transaction for second leg');
      }

      // Step 7: Deserialize, sign, and send second leg transaction
      console.log('[execute-arbitrage] Sending leg 2 transaction...');
      const tx2Bytes = base64Decode(swap2.swapTransaction);
      const tx2 = VersionedTransaction.deserialize(tx2Bytes);
      tx2.sign([opsWallet]);

      const tx2Signature = await connection.sendRawTransaction(tx2.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      console.log('[execute-arbitrage] Leg 2 tx sent:', tx2Signature);

      // Wait for confirmation
      const tx2Confirmation = await connection.confirmTransaction({
        signature: tx2Signature,
        blockhash: tx2.message.recentBlockhash,
        lastValidBlockHeight: swap2.lastValidBlockHeight,
      }, 'confirmed');

      if (tx2Confirmation.value.err) {
        throw new Error(`Leg 2 transaction failed: ${JSON.stringify(tx2Confirmation.value.err)}`);
      }
      console.log('[execute-arbitrage] Leg 2 confirmed');

      // Use second leg signature as the main tx signature for the run record
      txSignature = tx2Signature;
      
      // Calculate actual profit from the final quote
      actualProfitLamports = Number(BigInt(freshQuote2.outAmount) - DEFAULT_TRADE_AMOUNT_LAMPORTS);
      console.log('[execute-arbitrage] Actual profit (lamports):', actualProfitLamports);

    } catch (execError) {
      console.error('[execute-arbitrage] Execution error:', execError);
      status = 'FAILED';
      errorMessage = execError instanceof Error ? execError.message : 'Unknown execution error';
      
      if (execError instanceof JupiterApiError) {
        errorMessage = `Jupiter API Error: ${execError.message}`;
      }
    }

    const finishedAt = new Date().toISOString();

    // Insert the run record
    const { data: runData, error: runError } = await supabase
      .from('arbitrage_runs')
      .insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: finishedAt,
        status,
        estimated_profit_lamports: Number(DEFAULT_TRADE_AMOUNT_LAMPORTS), // TODO: Store actual estimated from quotes
        actual_profit_lamports: actualProfitLamports,
        tx_signature: txSignature,
        error_message: errorMessage,
      })
      .select()
      .single();

    if (runError) {
      console.error('[execute-arbitrage] Failed to insert run:', runError);
      throw new Error('Failed to create execution run record');
    }

    console.log(`[execute-arbitrage] Created execution run: ${runData.id}, status: ${status}`);

    return new Response(JSON.stringify({
      success: status === 'EXECUTED',
      message: status === 'EXECUTED' 
        ? 'Arbitrage executed successfully' 
        : `Arbitrage execution failed: ${errorMessage}`,
      run_id: runData.id,
      strategy_name: strategy.name,
      actual_profit_lamports: actualProfitLamports,
      tx_signature: txSignature,
      status,
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
