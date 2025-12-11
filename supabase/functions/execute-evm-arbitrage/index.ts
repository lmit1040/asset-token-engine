import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ethers } from "https://esm.sh/ethers@6.13.2";
import { getEvmOpsWallet, getEvmOpsBalance } from "../_shared/evm-ops-wallet.ts";
import { getZeroXQuote, isValidEvmAddress, calculateArbitrageProfit } from "../_shared/zerox-client.ts";
import { decryptEvmSecretKey, createEvmWalletFromDecrypted } from "../_shared/evm-fee-payer-crypto.ts";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Network RPC URLs (mainnets and testnets)
const NETWORK_RPC_URLS: Record<string, string> = {
  // Mainnets
  POLYGON: "https://polygon-rpc.com",
  ETHEREUM: "https://eth.llamarpc.com",
  ARBITRUM: "https://arb1.arbitrum.io/rpc",
  BSC: "https://bsc-dataseed1.binance.org",
  // Testnets
  POLYGON_AMOY: "https://rpc-amoy.polygon.technology",
  SEPOLIA: "https://eth-sepolia.g.alchemy.com/v2/demo",
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
  POLYGON_AMOY: 80002,
  SEPOLIA: 11155111,
  ARBITRUM_SEPOLIA: 421614,
  BSC_TESTNET: 97,
};

// EVM auto-refill thresholds (in native token units - ETH/MATIC/etc)
const MIN_BALANCE_THRESHOLD = 0.05; // Minimum balance before refill
const TOP_UP_AMOUNT = 0.1; // Amount to top up (in native token)
const AUTO_REFILL_PROFIT_THRESHOLD_WEI = 50_000_000_000_000_000n; // 0.05 ETH/MATIC profit triggers auto-refill

interface EvmFeePayer {
  id: string;
  public_key: string;
  secret_key_encrypted: string | null;
  label: string;
  balance_native: number | null;
  is_generated: boolean;
  usage_count?: number;
}

/**
 * Get an EVM fee payer from the database with rotation
 * Selects the least recently used active fee payer for the network
 */
async function getEvmFeePayerWithRotation(
  supabase: any,
  network: string
): Promise<{ wallet: ethers.Wallet; publicKey: string; feePayerId: string } | null> {
  const normalizedNetwork = network.toUpperCase();
  
  console.log(`[execute-evm-arbitrage] Looking for fee payer on ${normalizedNetwork}...`);
  
  // Get active fee payers for this network, ordered by last_used_at (oldest first)
  const { data: feePayers, error } = await supabase
    .from('evm_fee_payer_keys')
    .select('id, public_key, secret_key_encrypted, label, balance_native, is_generated, usage_count')
    .eq('network', normalizedNetwork)
    .eq('is_active', true)
    .gte('balance_native', MIN_BALANCE_THRESHOLD)
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(1);

  if (error) {
    console.error(`[execute-evm-arbitrage] Failed to fetch fee payers:`, error);
    return null;
  }

  if (!feePayers || feePayers.length === 0) {
    console.log(`[execute-evm-arbitrage] No active fee payers with sufficient balance on ${normalizedNetwork}`);
    return null;
  }

  const feePayer = feePayers[0] as EvmFeePayer;
  console.log(`[execute-evm-arbitrage] Selected fee payer: ${feePayer.label} (${feePayer.public_key})`);

  // Only generated fee payers have encrypted keys stored
  if (!feePayer.is_generated || !feePayer.secret_key_encrypted) {
    console.log(`[execute-evm-arbitrage] Fee payer ${feePayer.label} is not generated or has no encrypted key`);
    return null;
  }

  const encryptionKey = Deno.env.get('FEE_PAYER_ENCRYPTION_KEY');
  if (!encryptionKey) {
    console.error(`[execute-evm-arbitrage] FEE_PAYER_ENCRYPTION_KEY not configured`);
    return null;
  }

  try {
    // Decrypt the private key
    const decryptedPrivateKey = decryptEvmSecretKey(feePayer.secret_key_encrypted, encryptionKey);
    
    // Create provider and wallet
    const rpcUrl = NETWORK_RPC_URLS[normalizedNetwork];
    const chainId = CHAIN_IDS[normalizedNetwork];
    
    if (!rpcUrl || !chainId) {
      console.error(`[execute-evm-arbitrage] Unsupported network: ${normalizedNetwork}`);
      return null;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    const wallet = createEvmWalletFromDecrypted(decryptedPrivateKey, provider);

    // Update last_used_at and increment usage_count
    await supabase
      .from('evm_fee_payer_keys')
      .update({ 
        last_used_at: new Date().toISOString(),
        usage_count: (feePayer.usage_count || 0) + 1,
      })
      .eq('id', feePayer.id);

    return {
      wallet,
      publicKey: feePayer.public_key,
      feePayerId: feePayer.id,
    };
  } catch (error) {
    console.error(`[execute-evm-arbitrage] Failed to decrypt fee payer key:`, error);
    return null;
  }
}

// Auto-refill EVM fee payers from OPS wallet after profitable arbitrage
async function autoRefillEvmFeePayers(network: string): Promise<void> {
  console.log(`[execute-evm-arbitrage] Running auto-refill for ${network} fee payers...`);
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Get OPS wallet for this network
    const opsWallet = getEvmOpsWallet(network);
    const opsBalance = await getEvmOpsBalance(network);
    const opsBalanceNum = parseFloat(opsBalance);
    
    console.log(`[execute-evm-arbitrage] OPS wallet balance: ${opsBalance} on ${network}`);
    
    // Check if OPS wallet has enough to do refills
    if (opsBalanceNum < TOP_UP_AMOUNT * 2) {
      console.log(`[execute-evm-arbitrage] OPS wallet balance too low for refills`);
      return;
    }
    
    // Fetch active EVM fee payers that need top-up
    const { data: feePayers, error: fetchError } = await supabase
      .from('evm_fee_payer_keys')
      .select('id, public_key, label, balance_native')
      .eq('network', network.toUpperCase())
      .eq('is_active', true)
      .lt('balance_native', MIN_BALANCE_THRESHOLD);
    
    if (fetchError || !feePayers) {
      console.error(`[execute-evm-arbitrage] Failed to fetch fee payers:`, fetchError);
      return;
    }

    if (feePayers.length === 0) {
      console.log(`[execute-evm-arbitrage] No fee payers need top-up on ${network}`);
      return;
    }

    console.log(`[execute-evm-arbitrage] Found ${feePayers.length} fee payers needing top-up`);

    // Top up each fee payer
    for (const fp of feePayers) {
      try {
        const topUpWei = ethers.parseEther(TOP_UP_AMOUNT.toString());
        
        console.log(`[execute-evm-arbitrage] Topping up ${fp.label} with ${TOP_UP_AMOUNT} native tokens...`);
        
        const tx = await opsWallet.wallet.sendTransaction({
          to: fp.public_key,
          value: topUpWei,
        });
        
        const receipt = await tx.wait();
        console.log(`[execute-evm-arbitrage] Top-up tx confirmed: ${tx.hash}`);

        // Update balance in database
        const newBalance = (fp.balance_native || 0) + TOP_UP_AMOUNT;
        await supabase
          .from('evm_fee_payer_keys')
          .update({ balance_native: newBalance })
          .eq('id', fp.id);

        // Record the top-up
        await supabase.from('evm_fee_payer_topups').insert({
          fee_payer_public_key: fp.public_key,
          network: network.toUpperCase(),
          amount_wei: topUpWei.toString(),
          tx_hash: tx.hash,
        });

        console.log(`[execute-evm-arbitrage] Recorded top-up for ${fp.label}`);
      } catch (topUpError) {
        console.error(`[execute-evm-arbitrage] Failed to top up ${fp.label}:`, topUpError);
      }
    }
    
    // Log the auto-refill activity
    await supabase.from('activity_logs').insert({
      action_type: 'EVM_FEE_PAYER_AUTO_REFILL',
      entity_type: 'evm_fee_payer',
      entity_name: `${network} Fee Payers`,
      details: {
        network,
        ops_balance: opsBalance,
        fee_payers_topped_up: feePayers.length,
        top_up_amount: TOP_UP_AMOUNT,
        timestamp: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error(`[execute-evm-arbitrage] Auto-refill error:`, error);
  }
}

// 0x API endpoints per network for swap execution
const ZEROX_SWAP_URLS: Record<string, string> = {
  POLYGON: "https://polygon.api.0x.org",
  ETHEREUM: "https://api.0x.org",
  ARBITRUM: "https://arbitrum.api.0x.org",
  BSC: "https://bsc.api.0x.org",
};

// Get executable swap transaction from 0x
async function getZeroXSwapTransaction(params: {
  network: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress: string;
}): Promise<{ to: string; data: string; value: string; gas: string; gasPrice: string } | null> {
  const { network, sellToken, buyToken, sellAmount, takerAddress } = params;
  const normalizedNetwork = network.toUpperCase();
  
  const baseUrl = ZEROX_SWAP_URLS[normalizedNetwork];
  const chainId = CHAIN_IDS[normalizedNetwork];
  const apiKey = Deno.env.get("ZEROX_API_KEY");

  if (!baseUrl || !chainId) {
    console.error(`[execute-evm-arbitrage] Unsupported network: ${normalizedNetwork}`);
    return null;
  }

  // Use quote endpoint which returns executable transaction data
  const url = new URL(`${baseUrl}/swap/permit2/quote`);
  url.searchParams.set("sellToken", sellToken);
  url.searchParams.set("buyToken", buyToken);
  url.searchParams.set("sellAmount", sellAmount);
  url.searchParams.set("chainId", chainId.toString());
  url.searchParams.set("taker", takerAddress);

  console.log(`[execute-evm-arbitrage] Fetching swap tx: ${sellToken} -> ${buyToken}`);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["0x-api-key"] = apiKey;
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[execute-evm-arbitrage] 0x API error: ${response.status} - ${errorText.substring(0, 500)}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.transaction) {
      console.error(`[execute-evm-arbitrage] No transaction data in response`);
      return null;
    }

    return {
      to: data.transaction.to,
      data: data.transaction.data,
      value: data.transaction.value || "0",
      gas: data.transaction.gas || data.gas || "500000",
      gasPrice: data.transaction.gasPrice || data.gasPrice,
    };
  } catch (error) {
    console.error(`[execute-evm-arbitrage] Failed to get swap tx:`, error);
    return null;
  }
}

// Approve token spending for 0x allowance target
async function approveTokenIfNeeded(
  wallet: ethers.Wallet,
  tokenAddress: string,
  spender: string,
  amount: string
): Promise<boolean> {
  const erc20Abi = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ];

  try {
    const token = new ethers.Contract(tokenAddress, erc20Abi, wallet);
    const currentAllowance = await token.allowance(wallet.address, spender);
    
    if (BigInt(currentAllowance.toString()) >= BigInt(amount)) {
      console.log(`[execute-evm-arbitrage] Sufficient allowance exists`);
      return true;
    }

    console.log(`[execute-evm-arbitrage] Approving token spend...`);
    const approveTx = await token.approve(spender, ethers.MaxUint256);
    await approveTx.wait();
    console.log(`[execute-evm-arbitrage] Approval confirmed: ${approveTx.hash}`);
    return true;
  } catch (error) {
    console.error(`[execute-evm-arbitrage] Approval failed:`, error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[execute-evm-arbitrage] Starting EVM arbitrage execution...');

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

    // Parse request body
    const { strategy_id, use_ops_wallet } = await req.json();
    if (!strategy_id) {
      return new Response(JSON.stringify({ error: 'strategy_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch strategy
    const { data: strategy, error: stratError } = await supabase
      .from('arbitrage_strategies')
      .select('*')
      .eq('id', strategy_id)
      .maybeSingle();

    if (stratError || !strategy) {
      return new Response(JSON.stringify({ error: 'Strategy not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (strategy.chain_type !== 'EVM') {
      return new Response(JSON.stringify({ error: 'Not an EVM strategy' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[execute-evm-arbitrage] Executing strategy: ${strategy.name}`);
    console.log(`[execute-evm-arbitrage] Network: ${strategy.evm_network}`);

    const startedAt = new Date().toISOString();
    const network = strategy.evm_network || 'POLYGON';

    // Try to get a fee payer from the rotation pool first, fall back to OPS wallet
    let executionWallet: ethers.Wallet;
    let walletAddress: string;
    let usedFeePayer: { feePayerId: string } | null = null;

    if (!use_ops_wallet) {
      const feePayer = await getEvmFeePayerWithRotation(supabase, network);
      if (feePayer) {
        executionWallet = feePayer.wallet;
        walletAddress = feePayer.publicKey;
        usedFeePayer = { feePayerId: feePayer.feePayerId };
        console.log(`[execute-evm-arbitrage] Using fee payer: ${walletAddress}`);
      } else {
        console.log(`[execute-evm-arbitrage] No fee payer available, falling back to OPS wallet`);
        try {
          const opsWallet = getEvmOpsWallet(network);
          executionWallet = opsWallet.wallet;
          walletAddress = opsWallet.address;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Failed to initialize wallet';
          console.error(`[execute-evm-arbitrage] ${errorMsg}`);
          
          await supabase.from('arbitrage_runs').insert({
            strategy_id: strategy.id,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            status: 'FAILED',
            error_message: errorMsg,
          });

          return new Response(JSON.stringify({ error: errorMsg }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    } else {
      // Explicitly use OPS wallet
      try {
        const opsWallet = getEvmOpsWallet(network);
        executionWallet = opsWallet.wallet;
        walletAddress = opsWallet.address;
        console.log(`[execute-evm-arbitrage] Using OPS wallet: ${walletAddress}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to initialize OPS wallet';
        console.error(`[execute-evm-arbitrage] ${errorMsg}`);
        
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          error_message: errorMsg,
        });

        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Use 0.01 ETH equivalent for real execution (smaller for safety)
    const inputWei = '10000000000000000'; // 0.01 ETH

    // Step 1: Get quote for leg A
    console.log(`[execute-evm-arbitrage] Fetching leg A quote...`);
    const quoteA = await getZeroXQuote({
      network,
      sellToken: strategy.token_in_mint,
      buyToken: strategy.token_out_mint,
      sellAmount: inputWei,
      takerAddress: walletAddress,
    });

    if (!quoteA) {
      const errorMsg = 'Failed to get leg A quote';
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        error_message: errorMsg,
      });
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[execute-evm-arbitrage] Leg A expected output: ${quoteA.buyAmount}`);

    // Step 2: Get quote for leg B (estimate total profit)
    const quoteB = await getZeroXQuote({
      network,
      sellToken: strategy.token_out_mint,
      buyToken: strategy.token_in_mint,
      sellAmount: quoteA.buyAmount,
      takerAddress: walletAddress,
    });

    if (!quoteB) {
      const errorMsg = 'Failed to get leg B quote';
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        error_message: errorMsg,
      });
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const estimatedProfit = calculateArbitrageProfit(inputWei, quoteB.buyAmount);
    console.log(`[execute-evm-arbitrage] Estimated profit: ${estimatedProfit} wei`);

    // Check if profitable before executing
    if (estimatedProfit <= 0n) {
      const errorMsg = `Unprofitable: ${estimatedProfit} wei`;
      console.log(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'SIMULATED',
        estimated_profit_lamports: Number(estimatedProfit / 1_000_000_000n),
        error_message: errorMsg,
      });

      return new Response(JSON.stringify({
        success: false,
        message: 'Trade not profitable',
        estimated_profit_wei: estimatedProfit.toString(),
        status: 'SIMULATED',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Get executable swap transaction for leg A
    console.log(`[execute-evm-arbitrage] Getting swap transaction for leg A...`);
    const swapTxA = await getZeroXSwapTransaction({
      network,
      sellToken: strategy.token_in_mint,
      buyToken: strategy.token_out_mint,
      sellAmount: inputWei,
      takerAddress: walletAddress,
    });

    if (!swapTxA) {
      const errorMsg = 'Failed to get leg A swap transaction';
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        estimated_profit_lamports: Number(estimatedProfit / 1_000_000_000n),
        error_message: errorMsg,
      });
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 4: Approve token if needed (for non-native tokens)
    const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
    
    // Check if selling native token (ETH/MATIC)
    const isNativeToken = strategy.token_in_mint.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    
    if (!isNativeToken) {
      const approved = await approveTokenIfNeeded(
        executionWallet,
        strategy.token_in_mint,
        PERMIT2_ADDRESS,
        inputWei
      );
      
      if (!approved) {
        const errorMsg = 'Token approval failed';
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          estimated_profit_lamports: Number(estimatedProfit / 1_000_000_000n),
          error_message: errorMsg,
        });
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Step 5: Execute leg A swap
    console.log(`[execute-evm-arbitrage] Executing leg A swap...`);
    let txHashA: string;
    try {
      const txA = await executionWallet.sendTransaction({
        to: swapTxA.to,
        data: swapTxA.data,
        value: swapTxA.value,
        gasLimit: BigInt(swapTxA.gas) * 2n, // Add buffer for safety
      });
      
      console.log(`[execute-evm-arbitrage] Leg A tx sent: ${txA.hash}`);
      const receiptA = await txA.wait();
      txHashA = txA.hash;
      console.log(`[execute-evm-arbitrage] Leg A confirmed in block ${receiptA?.blockNumber}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Leg A execution failed';
      console.error(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        estimated_profit_lamports: Number(estimatedProfit / 1_000_000_000n),
        error_message: errorMsg,
      });

      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 6: Get swap transaction for leg B
    console.log(`[execute-evm-arbitrage] Getting swap transaction for leg B...`);
    const swapTxB = await getZeroXSwapTransaction({
      network,
      sellToken: strategy.token_out_mint,
      buyToken: strategy.token_in_mint,
      sellAmount: quoteA.buyAmount,
      takerAddress: walletAddress,
    });

    if (!swapTxB) {
      const errorMsg = 'Failed to get leg B swap transaction (leg A already executed!)';
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        tx_signature: txHashA,
        estimated_profit_lamports: Number(estimatedProfit / 1_000_000_000n),
        error_message: errorMsg,
      });
      return new Response(JSON.stringify({ error: errorMsg, leg_a_tx: txHashA }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Approve leg B token if needed
    const isLegBNative = strategy.token_out_mint.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    if (!isLegBNative) {
      await approveTokenIfNeeded(
        executionWallet,
        strategy.token_out_mint,
        PERMIT2_ADDRESS,
        quoteA.buyAmount
      );
    }

    // Step 7: Execute leg B swap
    console.log(`[execute-evm-arbitrage] Executing leg B swap...`);
    let txHashB: string;
    try {
      const txB = await executionWallet.sendTransaction({
        to: swapTxB.to,
        data: swapTxB.data,
        value: swapTxB.value,
        gasLimit: BigInt(swapTxB.gas) * 2n,
      });
      
      console.log(`[execute-evm-arbitrage] Leg B tx sent: ${txB.hash}`);
      const receiptB = await txB.wait();
      txHashB = txB.hash;
      console.log(`[execute-evm-arbitrage] Leg B confirmed in block ${receiptB?.blockNumber}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Leg B execution failed';
      console.error(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        tx_signature: txHashA,
        estimated_profit_lamports: Number(estimatedProfit / 1_000_000_000n),
        error_message: `Leg B failed: ${errorMsg}`,
      });

      return new Response(JSON.stringify({ 
        error: errorMsg, 
        leg_a_tx: txHashA,
        partial_execution: true,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Success - record the execution
    const finishedAt = new Date().toISOString();
    const { data: runData } = await supabase
      .from('arbitrage_runs')
      .insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: finishedAt,
        status: 'EXECUTED',
        tx_signature: `${txHashA},${txHashB}`,
        estimated_profit_lamports: Number(estimatedProfit / 1_000_000_000n),
        actual_profit_lamports: Number(estimatedProfit / 1_000_000_000n),
      })
      .select()
      .maybeSingle();

    console.log(`[execute-evm-arbitrage] Arbitrage executed successfully!`);

    // Trigger auto-refill if profit exceeds threshold
    if (estimatedProfit >= AUTO_REFILL_PROFIT_THRESHOLD_WEI) {
      console.log(`[execute-evm-arbitrage] Profit ${estimatedProfit} >= threshold, triggering auto-refill...`);
      EdgeRuntime.waitUntil(autoRefillEvmFeePayers(network));
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'EVM arbitrage executed successfully',
      strategy_name: strategy.name,
      network,
      wallet_used: walletAddress,
      used_fee_payer: !!usedFeePayer,
      leg_a_tx: txHashA,
      leg_b_tx: txHashB,
      estimated_profit_wei: estimatedProfit.toString(),
      estimated_profit_eth: Number(estimatedProfit) / 1e18,
      run_id: runData?.id,
      status: 'EXECUTED',
      auto_refill_triggered: estimatedProfit >= AUTO_REFILL_PROFIT_THRESHOLD_WEI,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[execute-evm-arbitrage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
