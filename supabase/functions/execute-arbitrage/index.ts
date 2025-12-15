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
import { 
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "https://esm.sh/@solana/spl-token@0.3.8";
import { getOpsWalletKeypair } from "../_shared/ops-wallet.ts";
import { 
  getJupiterQuote, 
  getJupiterSwapInstructions, 
  calculateArbitrageNetProfit,
  areQuotesExecutable,
  getMinNetProfitLamports,
  getMinProfitBps,
  getMaxNotionalLamports,
  JupiterApiError,
  isValidSolanaAddress,
  SerializedInstruction,
  JupiterQuoteOptions,
} from "../_shared/jupiter-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment config
const ARB_ENV = Deno.env.get('ARB_ENV') || 'devnet';
const DEFAULT_TRADE_AMOUNT_LAMPORTS = BigInt(Deno.env.get('DEFAULT_TRADE_AMOUNT') || '100000000'); // 0.1 SOL

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
 * Get SOL balance for a wallet
 */
async function getSolBalance(connection: Connection, pubkey: PublicKey): Promise<bigint> {
  const balance = await connection.getBalance(pubkey);
  return BigInt(balance);
}

/**
 * Get token balance for an ATA
 */
async function getTokenBalance(connection: Connection, mint: string, owner: PublicKey): Promise<bigint> {
  try {
    const mintPubkey = new PublicKey(mint);
    const ata = await getAssociatedTokenAddress(mintPubkey, owner);
    const accountInfo = await connection.getTokenAccountBalance(ata);
    return BigInt(accountInfo.value.amount);
  } catch {
    // Account doesn't exist or error
    return BigInt(0);
  }
}

interface BalanceSnapshot {
  solLamports: bigint;
  tokenInBalance: bigint;
  tokenOutBalance: bigint;
  timestamp: number;
}

/**
 * Take a snapshot of wallet balances
 */
async function snapshotBalances(
  connection: Connection,
  wallet: PublicKey,
  tokenInMint: string,
  tokenOutMint: string
): Promise<BalanceSnapshot> {
  const [solLamports, tokenInBalance, tokenOutBalance] = await Promise.all([
    getSolBalance(connection, wallet),
    getTokenBalance(connection, tokenInMint, wallet),
    getTokenBalance(connection, tokenOutMint, wallet),
  ]);
  
  return {
    solLamports,
    tokenInBalance,
    tokenOutBalance,
    timestamp: Date.now(),
  };
}

/**
 * Calculate realized profit from balance snapshots
 */
function calculateRealizedProfit(
  preBal: BalanceSnapshot,
  postBal: BalanceSnapshot,
  tokenInMint: string
): { realizedProfitLamports: bigint; breakdown: Record<string, bigint> } {
  // For SOL-based arbitrage, profit is the change in SOL balance (minus gas)
  // For token arbitrage, we need to track the input token balance
  
  const solDelta = postBal.solLamports - preBal.solLamports;
  const tokenInDelta = postBal.tokenInBalance - preBal.tokenInBalance;
  
  // If input is WSOL, use SOL delta directly
  const isWsol = tokenInMint === 'So11111111111111111111111111111111111111112';
  
  if (isWsol) {
    // For SOL pairs, the profit is just the SOL balance change
    return {
      realizedProfitLamports: solDelta,
      breakdown: {
        solDelta,
        tokenInDelta,
        tokenOutDelta: postBal.tokenOutBalance - preBal.tokenOutBalance,
      },
    };
  } else {
    // For token pairs, profit is the token balance change
    // But we also account for SOL spent on gas
    return {
      realizedProfitLamports: tokenInDelta + solDelta, // Token gain minus gas cost
      breakdown: {
        solDelta,
        tokenInDelta,
        tokenOutDelta: postBal.tokenOutBalance - preBal.tokenOutBalance,
      },
    };
  }
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
    console.log('[execute-arbitrage] ========== STARTING ATOMIC ARBITRAGE EXECUTION ==========');
    console.log(`[execute-arbitrage] Environment: ${ARB_ENV}`);
    console.log(`[execute-arbitrage] Min net profit threshold: ${getMinNetProfitLamports()} lamports`);
    console.log(`[execute-arbitrage] Min profit bps threshold: ${getMinProfitBps()}`);

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
    console.log(`[execute-arbitrage] DEX A: ${strategy.dex_a || 'Any'}, DEX B: ${strategy.dex_b || 'Any'}`);

    // Check environment - reject mainnet execution if not in mainnet mode
    if (ARB_ENV === 'devnet' || ARB_ENV === 'testnet') {
      console.log(`[execute-arbitrage] Running in ${ARB_ENV} mode - SIMULATION ONLY`);
      // In devnet/testnet, we still execute but log clearly
    }

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
    let realizedProfitLamports = BigInt(0);
    let errorMessage: string | null = null;
    let status: 'EXECUTED' | 'FAILED' = 'EXECUTED';
    let estimatedProfitLamports = BigInt(0);
    let estimatedGasCostLamports = BigInt(0);
    let preBal: BalanceSnapshot | null = null;
    let postBal: BalanceSnapshot | null = null;

    // Determine trade amount (respect max notional cap)
    const maxNotional = getMaxNotionalLamports();
    let inputLamports = DEFAULT_TRADE_AMOUNT_LAMPORTS;
    if (strategy.max_trade_value_native && BigInt(strategy.max_trade_value_native) > 0) {
      inputLamports = BigInt(strategy.max_trade_value_native);
    }
    if (inputLamports > maxNotional) {
      console.log(`[execute-arbitrage] Capping trade to max notional: ${maxNotional}`);
      inputLamports = maxNotional;
    }

    try {
      // ========== STEP 1: Take pre-execution balance snapshot ==========
      console.log('[execute-arbitrage] Taking pre-execution balance snapshot...');
      preBal = await snapshotBalances(
        connection,
        opsWallet.publicKey,
        strategy.token_in_mint,
        strategy.token_out_mint
      );
      console.log('[execute-arbitrage] Pre-balances:', {
        sol: preBal.solLamports.toString(),
        tokenIn: preBal.tokenInBalance.toString(),
        tokenOut: preBal.tokenOutBalance.toString(),
      });

      // ========== STEP 2: Get fresh quotes with DEX constraints ==========
      const optionsA: JupiterQuoteOptions = {
        slippageBps: 100, // 1% slippage for execution
      };
      if (strategy.dex_a) {
        optionsA.allowedDexes = [strategy.dex_a];
      }

      console.log('[execute-arbitrage] Getting fresh quote for leg 1...');
      const quote1 = await getJupiterQuote(
        strategy.token_in_mint,
        strategy.token_out_mint,
        inputLamports,
        optionsA
      );

      if (!quote1) {
        throw new Error('No route found for first leg');
      }

      // ========== STEP 3: Block mock quotes from execution ==========
      if (quote1.isMock) {
        throw new Error('BLOCKED: Quote 1 is mock data - cannot execute mock quotes');
      }

      console.log('[execute-arbitrage] Leg 1 quote: in=', quote1.inAmount, 'out=', quote1.outAmount);

      // Get quote for second leg with DEX constraint
      const optionsB: JupiterQuoteOptions = {
        slippageBps: 100,
      };
      if (strategy.dex_b) {
        optionsB.allowedDexes = [strategy.dex_b];
      }

      const leg2Amount = BigInt(quote1.outAmount);
      console.log('[execute-arbitrage] Getting fresh quote for leg 2...');
      const quote2 = await getJupiterQuote(
        strategy.token_out_mint,
        strategy.token_in_mint,
        leg2Amount,
        optionsB
      );

      if (!quote2) {
        throw new Error('No route found for second leg');
      }

      if (quote2.isMock) {
        throw new Error('BLOCKED: Quote 2 is mock data - cannot execute mock quotes');
      }

      console.log('[execute-arbitrage] Leg 2 quote: in=', quote2.inAmount, 'out=', quote2.outAmount);

      // Double-check quotes are executable
      const execCheck = areQuotesExecutable(quote1, quote2);
      if (!execCheck.executable) {
        throw new Error(`BLOCKED: ${execCheck.reason}`);
      }

      // ========== STEP 4: Calculate net profit and validate thresholds ==========
      const netProfitResult = calculateArbitrageNetProfit(inputLamports, quote1, quote2);
      estimatedProfitLamports = netProfitResult.netProfitLamports;
      estimatedGasCostLamports = netProfitResult.feeBreakdown.totalFeesLamports;

      console.log('[execute-arbitrage] Net profit calculation:', {
        grossProfit: netProfitResult.grossProfitLamports.toString(),
        netProfit: netProfitResult.netProfitLamports.toString(),
        netProfitBps: netProfitResult.netProfitBps,
        totalFees: netProfitResult.feeBreakdown.totalFeesLamports.toString(),
        meetsThresholds: netProfitResult.meetsThresholds,
      });

      // Enforce profit thresholds
      if (netProfitResult.netProfitLamports < BigInt(getMinNetProfitLamports())) {
        throw new Error(`BLOCKED: Net profit ${netProfitResult.netProfitLamports} below minimum threshold ${getMinNetProfitLamports()}`);
      }

      if (netProfitResult.netProfitBps < getMinProfitBps()) {
        throw new Error(`BLOCKED: Profit ${netProfitResult.netProfitBps} bps below minimum threshold ${getMinProfitBps()} bps`);
      }

      // Also check strategy-specific thresholds
      if (Number(netProfitResult.netProfitLamports) < strategy.min_profit_lamports) {
        throw new Error(`BLOCKED: Net profit ${netProfitResult.netProfitLamports} below strategy minimum ${strategy.min_profit_lamports}`);
      }

      console.log('[execute-arbitrage] All profit thresholds passed, proceeding with execution...');

      // ========== STEP 5: Get swap instructions for both legs ==========
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

      // ========== STEP 6: Collect all address lookup tables ==========
      const allLookupTableAddresses = [
        ...new Set([
          ...(instructions1.addressLookupTableAddresses || []),
          ...(instructions2.addressLookupTableAddresses || []),
        ])
      ];
      console.log('[execute-arbitrage] Fetching', allLookupTableAddresses.length, 'address lookup tables...');
      
      const addressLookupTableAccounts = await getAddressLookupTableAccounts(connection, allLookupTableAddresses);
      console.log('[execute-arbitrage] Loaded', addressLookupTableAccounts.length, 'lookup tables');

      // ========== STEP 7: Build atomic transaction with deduplicated instructions ==========
      const allInstructions: TransactionInstruction[] = [];
      const seenProgramIds = new Set<string>();

      // Add compute budget instructions from leg 1 only (deduplicate)
      for (const ix of instructions1.computeBudgetInstructions || []) {
        const key = `${ix.programId}-${ix.data}`;
        if (!seenProgramIds.has(key)) {
          seenProgramIds.add(key);
          allInstructions.push(deserializeInstruction(ix));
        }
      }

      // Add setup instructions from leg 1 (deduplicate ATA creation)
      const seenSetups = new Set<string>();
      for (const ix of instructions1.setupInstructions || []) {
        const key = JSON.stringify(ix.accounts.map(a => a.pubkey));
        if (!seenSetups.has(key)) {
          seenSetups.add(key);
          allInstructions.push(deserializeInstruction(ix));
        }
      }

      // Add token ledger instruction from leg 1 if present
      if (instructions1.tokenLedgerInstruction) {
        allInstructions.push(deserializeInstruction(instructions1.tokenLedgerInstruction));
      }

      // Add swap instruction for leg 1
      allInstructions.push(deserializeInstruction(instructions1.swapInstruction));

      // Add setup instructions from leg 2 (deduplicate)
      for (const ix of instructions2.setupInstructions || []) {
        const key = JSON.stringify(ix.accounts.map(a => a.pubkey));
        if (!seenSetups.has(key)) {
          seenSetups.add(key);
          allInstructions.push(deserializeInstruction(ix));
        }
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

      // ========== STEP 8: Get recent blockhash and build versioned transaction ==========
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      const messageV0 = new TransactionMessage({
        payerKey: opsWallet.publicKey,
        recentBlockhash: blockhash,
        instructions: allInstructions,
      }).compileToV0Message(addressLookupTableAccounts);

      const atomicTransaction = new VersionedTransaction(messageV0);
      atomicTransaction.sign([opsWallet]);

      console.log('[execute-arbitrage] Sending atomic transaction...');

      // ========== STEP 9: Send and confirm atomic transaction ==========
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

      // ========== STEP 10: Take post-execution balance snapshot ==========
      console.log('[execute-arbitrage] Taking post-execution balance snapshot...');
      postBal = await snapshotBalances(
        connection,
        opsWallet.publicKey,
        strategy.token_in_mint,
        strategy.token_out_mint
      );
      console.log('[execute-arbitrage] Post-balances:', {
        sol: postBal.solLamports.toString(),
        tokenIn: postBal.tokenInBalance.toString(),
        tokenOut: postBal.tokenOutBalance.toString(),
      });

      // ========== STEP 11: Calculate REALIZED profit from balance snapshots ==========
      const realizedResult = calculateRealizedProfit(preBal, postBal, strategy.token_in_mint);
      realizedProfitLamports = realizedResult.realizedProfitLamports;
      
      console.log('[execute-arbitrage] REALIZED profit calculation:', {
        realizedProfit: realizedProfitLamports.toString(),
        estimatedProfit: estimatedProfitLamports.toString(),
        breakdown: Object.fromEntries(
          Object.entries(realizedResult.breakdown).map(([k, v]) => [k, v.toString()])
        ),
      });

    } catch (execError) {
      console.error('[execute-arbitrage] Execution error:', execError);
      status = 'FAILED';
      errorMessage = execError instanceof Error ? execError.message : 'Unknown execution error';
      
      if (execError instanceof JupiterApiError) {
        errorMessage = `Jupiter API Error: ${execError.message}`;
      }
    }

    const finishedAt = new Date().toISOString();

    // Insert the run record with REALIZED profit
    const { data: runData, error: runError } = await supabase
      .from('arbitrage_runs')
      .insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: finishedAt,
        status,
        estimated_profit_lamports: Number(estimatedProfitLamports),
        estimated_gas_cost_native: Number(estimatedGasCostLamports),
        actual_profit_lamports: Number(realizedProfitLamports), // REALIZED, not estimated!
        tx_signature: txSignature,
        error_message: errorMessage,
        run_type: 'EXECUTE',
        purpose: strategy.is_for_fee_payer_refill ? 'FEE_PAYER_REFILL' : 
                 strategy.is_for_ops_refill ? 'OPS_REFILL' : 'MANUAL',
      })
      .select()
      .single();

    if (runError) {
      console.error('[execute-arbitrage] Failed to insert run:', runError);
      throw new Error('Failed to create execution run record');
    }

    console.log(`[execute-arbitrage] Created execution run: ${runData.id}, status: ${status}`);
    console.log(`[execute-arbitrage] Estimated profit: ${estimatedProfitLamports}, Realized profit: ${realizedProfitLamports}`);

    // Auto-refill fee payers from profits if execution was successful and profitable
    let autoRefillTriggered = false;
    if (status === 'EXECUTED' && Number(realizedProfitLamports) >= AUTO_REFILL_PROFIT_THRESHOLD_LAMPORTS) {
      console.log('[execute-arbitrage] Triggering auto fee payer refill from profits...');
      autoRefillTriggered = true;
      // Run in background using EdgeRuntime.waitUntil
      EdgeRuntime.waitUntil(autoRefillFeePayers(connection, opsWallet, Number(realizedProfitLamports), supabase));
    }

    return new Response(JSON.stringify({
      success: status === 'EXECUTED',
      message: status === 'EXECUTED' 
        ? 'Atomic arbitrage executed successfully (both legs in single tx)' 
        : `Arbitrage execution failed: ${errorMessage}`,
      run_id: runData.id,
      strategy_name: strategy.name,
      dex_a: strategy.dex_a || 'Any',
      dex_b: strategy.dex_b || 'Any',
      input_lamports: Number(inputLamports),
      estimated_profit_lamports: Number(estimatedProfitLamports),
      realized_profit_lamports: Number(realizedProfitLamports),
      estimated_gas_cost_lamports: Number(estimatedGasCostLamports),
      profit_difference: Number(realizedProfitLamports - estimatedProfitLamports),
      tx_signature: txSignature,
      status,
      atomic: true,
      environment: ARB_ENV,
      auto_refill_triggered: autoRefillTriggered,
      balance_snapshots: preBal && postBal ? {
        pre: {
          sol: Number(preBal.solLamports),
          tokenIn: Number(preBal.tokenInBalance),
          tokenOut: Number(preBal.tokenOutBalance),
        },
        post: {
          sol: Number(postBal.solLamports),
          tokenIn: Number(postBal.tokenInBalance),
          tokenOut: Number(postBal.tokenOutBalance),
        },
      } : null,
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
