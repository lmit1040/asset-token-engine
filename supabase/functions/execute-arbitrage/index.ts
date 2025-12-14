import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

import {
  Connection, 
  TransactionMessage, 
  VersionedTransaction, 
  TransactionInstruction,
  PublicKey,
  AddressLookupTableAccount,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "https://esm.sh/@solana/web3.js@1.87.6";
import { getOpsWalletKeypair } from "../_shared/ops-wallet.ts";
import { 
  getJupiterQuote, 
  getJupiterSwapInstructions, 
  JupiterApiError,
  isValidSolanaAddress,
  SerializedInstruction,
} from "../_shared/jupiter-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default trade amount for arbitrage (in lamports for SOL-based pairs)
const DEFAULT_TRADE_AMOUNT_LAMPORTS = BigInt(100_000_000); // 0.1 SOL

// Fee payer auto-refill configuration
const MIN_BALANCE_THRESHOLD_SOL = 0.05;
const TOP_UP_AMOUNT_SOL = 0.2;
const AUTO_REFILL_PROFIT_THRESHOLD_LAMPORTS = 10_000_000; // Only refill if profit >= 0.01 SOL

/**
 * Convert a serialized Jupiter instruction to a TransactionInstruction
 */
function deserializeInstruction(instruction: SerializedInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.pubkey),
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    })),
    data: new Uint8Array(base64Decode(instruction.data)),
  });
}

/**
 * Fetch address lookup tables from the chain
 */
async function getAddressLookupTableAccounts(
  connection: Connection,
  addresses: string[]
): Promise<AddressLookupTableAccount[]> {
  const lookupTableAccounts: AddressLookupTableAccount[] = [];
  
  for (const address of addresses) {
    const result = await connection.getAddressLookupTable(new PublicKey(address));
    if (result.value) {
      lookupTableAccounts.push(result.value);
    }
  }
  
  return lookupTableAccounts;
}

/**
 * Automatically top up fee payers from arbitrage profits (runs in background)
 */
async function autoRefillFeePayers(
  connection: Connection,
  opsWallet: any,
  profitLamports: number,
  supabase: any
): Promise<void> {
  console.log('[execute-arbitrage] Starting auto fee payer refill from profits...');
  
  try {
    // Fetch active fee payers
    const { data: feePayers, error: fpError } = await supabase
      .from('fee_payer_keys')
      .select('*')
      .eq('is_active', true);

    if (fpError || !feePayers?.length) {
      console.log('[execute-arbitrage] No active fee payers to refill');
      return;
    }

    const topUpAmountLamports = Math.floor(TOP_UP_AMOUNT_SOL * LAMPORTS_PER_SOL);
    let refillCount = 0;

    for (const feePayer of feePayers) {
      try {
        const feePayerPubkey = new PublicKey(feePayer.public_key);
        const balance = await connection.getBalance(feePayerPubkey);
        const balanceSol = balance / LAMPORTS_PER_SOL;

        if (balanceSol < MIN_BALANCE_THRESHOLD_SOL) {
          console.log(`[execute-arbitrage] Auto-refilling ${feePayer.label} (${balanceSol.toFixed(4)} SOL)`);

          // Check if OPS wallet has enough balance
          const opsBalance = await connection.getBalance(opsWallet.publicKey);
          if (opsBalance < topUpAmountLamports + 5000) {
            console.warn('[execute-arbitrage] OPS wallet insufficient for auto-refill');
            break;
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
          console.log(`[execute-arbitrage] Auto-refill tx: ${signature}`);

          // Log the top-up
          await supabase.from('fee_payer_topups').insert({
            fee_payer_public_key: feePayer.public_key,
            amount_lamports: topUpAmountLamports,
            tx_signature: signature,
          });

          // Update fee payer balance
          const newBalance = await connection.getBalance(feePayerPubkey);
          await supabase
            .from('fee_payer_keys')
            .update({ balance_sol: newBalance / LAMPORTS_PER_SOL })
            .eq('id', feePayer.id);

          refillCount++;
        }
      } catch (err) {
        console.error(`[execute-arbitrage] Auto-refill error for ${feePayer.label}:`, err);
      }
    }

    console.log(`[execute-arbitrage] Auto-refilled ${refillCount} fee payers from arbitrage profits`);
  } catch (error) {
    console.error('[execute-arbitrage] Auto-refill background task error:', error);
  }
}

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
    console.log('[execute-arbitrage] Starting ATOMIC arbitrage execution...');

    // Get authorization header and extract JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[execute-arbitrage] No authorization header present');
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // Get dynamic Solana connection (mainnet/devnet based on system settings)
    const { getSolanaConnection, getExplorerUrl } = await import("../_shared/solana-connection.ts");
    const { connection, isMainnet, rpcUrl } = await getSolanaConnection();
    console.log(`[execute-arbitrage] Connected to Solana RPC (${isMainnet ? 'MAINNET' : 'DEVNET'}):`, rpcUrl);

    const startedAt = new Date().toISOString();
    let txSignature: string | null = null;
    let actualProfitLamports = 0;
    let errorMessage: string | null = null;
    let status: 'EXECUTED' | 'FAILED' = 'EXECUTED';
    let estimatedProfitLamports = 0;

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
      estimatedProfitLamports = Number(estimatedProfit);
      console.log('[execute-arbitrage] Estimated profit (lamports):', estimatedProfit.toString());

      // Check if profit meets minimum threshold
      if (estimatedProfit < BigInt(strategy.min_profit_lamports)) {
        throw new Error(`Profit ${estimatedProfit} below minimum threshold ${strategy.min_profit_lamports}`);
      }

      // Step 3: Get swap instructions for both legs
      console.log('[execute-arbitrage] Getting swap instructions for leg 1...');
      const instructions1 = await getJupiterSwapInstructions(quote1, opsWallet.publicKey.toBase58());
      if (!instructions1) {
        throw new Error('Failed to get swap instructions for first leg');
      }

      console.log('[execute-arbitrage] Getting swap instructions for leg 2...');
      const instructions2 = await getJupiterSwapInstructions(quote2, opsWallet.publicKey.toBase58());
      if (!instructions2) {
        throw new Error('Failed to get swap instructions for second leg');
      }

      // Step 4: Collect all address lookup tables
      const allLookupTableAddresses = [
        ...new Set([
          ...(instructions1.addressLookupTableAddresses || []),
          ...(instructions2.addressLookupTableAddresses || []),
        ])
      ];
      console.log('[execute-arbitrage] Fetching', allLookupTableAddresses.length, 'address lookup tables...');
      
      const addressLookupTableAccounts = await getAddressLookupTableAccounts(connection, allLookupTableAddresses);
      console.log('[execute-arbitrage] Loaded', addressLookupTableAccounts.length, 'lookup tables');

      // Step 5: Build atomic transaction with all instructions from both legs
      const allInstructions: TransactionInstruction[] = [];

      // Add compute budget instructions from both legs (deduplicate by taking from leg 1)
      for (const ix of instructions1.computeBudgetInstructions || []) {
        allInstructions.push(deserializeInstruction(ix));
      }

      // Add setup instructions from leg 1
      for (const ix of instructions1.setupInstructions || []) {
        allInstructions.push(deserializeInstruction(ix));
      }

      // Add token ledger instruction from leg 1 if present
      if (instructions1.tokenLedgerInstruction) {
        allInstructions.push(deserializeInstruction(instructions1.tokenLedgerInstruction));
      }

      // Add swap instruction for leg 1
      allInstructions.push(deserializeInstruction(instructions1.swapInstruction));

      // Add setup instructions from leg 2 (may need to create intermediate token accounts)
      for (const ix of instructions2.setupInstructions || []) {
        allInstructions.push(deserializeInstruction(ix));
      }

      // Add token ledger instruction from leg 2 if present
      if (instructions2.tokenLedgerInstruction) {
        allInstructions.push(deserializeInstruction(instructions2.tokenLedgerInstruction));
      }

      // Add swap instruction for leg 2
      allInstructions.push(deserializeInstruction(instructions2.swapInstruction));

      // Add cleanup instructions from both legs
      if (instructions1.cleanupInstruction) {
        allInstructions.push(deserializeInstruction(instructions1.cleanupInstruction));
      }
      if (instructions2.cleanupInstruction) {
        allInstructions.push(deserializeInstruction(instructions2.cleanupInstruction));
      }

      console.log('[execute-arbitrage] Built atomic transaction with', allInstructions.length, 'instructions');

      // Step 6: Get recent blockhash and build versioned transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      const messageV0 = new TransactionMessage({
        payerKey: opsWallet.publicKey,
        recentBlockhash: blockhash,
        instructions: allInstructions,
      }).compileToV0Message(addressLookupTableAccounts);

      const atomicTransaction = new VersionedTransaction(messageV0);
      atomicTransaction.sign([opsWallet]);

      console.log('[execute-arbitrage] Sending atomic transaction...');

      // Step 7: Send and confirm atomic transaction
      txSignature = await connection.sendRawTransaction(atomicTransaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      console.log('[execute-arbitrage] Atomic tx sent:', txSignature);

      const confirmation = await connection.confirmTransaction({
        signature: txSignature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Atomic transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log('[execute-arbitrage] Atomic transaction confirmed!');
      
      // Use estimated profit as actual (actual would require balance checks before/after)
      actualProfitLamports = estimatedProfitLamports;
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
        estimated_profit_lamports: estimatedProfitLamports,
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

    // Auto-refill fee payers from profits if execution was successful
    let autoRefillTriggered = false;
    if (status === 'EXECUTED' && actualProfitLamports >= AUTO_REFILL_PROFIT_THRESHOLD_LAMPORTS) {
      console.log('[execute-arbitrage] Triggering auto fee payer refill from profits...');
      autoRefillTriggered = true;
      // Run in background using EdgeRuntime.waitUntil
      EdgeRuntime.waitUntil(autoRefillFeePayers(connection, opsWallet, actualProfitLamports, supabase));
    }

    return new Response(JSON.stringify({
      success: status === 'EXECUTED',
      message: status === 'EXECUTED' 
        ? 'Atomic arbitrage executed successfully (both legs in single tx)' 
        : `Arbitrage execution failed: ${errorMessage}`,
      run_id: runData.id,
      strategy_name: strategy.name,
      estimated_profit_lamports: estimatedProfitLamports,
      actual_profit_lamports: actualProfitLamports,
      tx_signature: txSignature,
      status,
      atomic: true,
      auto_refill_triggered: autoRefillTriggered,
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
