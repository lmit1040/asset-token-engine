import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getEvmOpsWallet } from "../_shared/evm-ops-wallet.ts";
import { getZeroXQuote, isValidEvmAddress, calculateArbitrageProfit } from "../_shared/zerox-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 0x API endpoints per network for swap execution
const ZEROX_SWAP_URLS: Record<string, string> = {
  POLYGON: "https://polygon.api.0x.org",
  ETHEREUM: "https://api.0x.org",
  ARBITRUM: "https://arbitrum.api.0x.org",
  BSC: "https://bsc.api.0x.org",
};

const CHAIN_IDS: Record<string, number> = {
  POLYGON: 137,
  ETHEREUM: 1,
  ARBITRUM: 42161,
  BSC: 56,
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
  wallet: any,
  tokenAddress: string,
  spender: string,
  amount: string
): Promise<boolean> {
  const { ethers } = await import("https://esm.sh/ethers@6.13.2");
  
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
    const { strategy_id } = await req.json();
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

    // Get OPS wallet for the network
    let opsWallet;
    try {
      opsWallet = getEvmOpsWallet(network);
      console.log(`[execute-evm-arbitrage] OPS wallet: ${opsWallet.address}`);
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

    // Use 0.01 ETH equivalent for real execution (smaller for safety)
    const inputWei = '10000000000000000'; // 0.01 ETH

    // Step 1: Get quote for leg A
    console.log(`[execute-evm-arbitrage] Fetching leg A quote...`);
    const quoteA = await getZeroXQuote({
      network,
      sellToken: strategy.token_in_mint,
      buyToken: strategy.token_out_mint,
      sellAmount: inputWei,
      takerAddress: opsWallet.address,
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
      takerAddress: opsWallet.address,
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
      takerAddress: opsWallet.address,
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
        opsWallet.wallet,
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
      const txA = await opsWallet.wallet.sendTransaction({
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
      takerAddress: opsWallet.address,
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
        opsWallet.wallet,
        strategy.token_out_mint,
        PERMIT2_ADDRESS,
        quoteA.buyAmount
      );
    }

    // Step 7: Execute leg B swap
    console.log(`[execute-evm-arbitrage] Executing leg B swap...`);
    let txHashB: string;
    try {
      const txB = await opsWallet.wallet.sendTransaction({
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
        actual_profit_lamports: Number(estimatedProfit / 1_000_000_000n), // Would need on-chain verification for exact
      })
      .select()
      .maybeSingle();

    console.log(`[execute-evm-arbitrage] Arbitrage executed successfully!`);

    return new Response(JSON.stringify({
      success: true,
      message: 'EVM arbitrage executed successfully',
      strategy_name: strategy.name,
      network,
      leg_a_tx: txHashA,
      leg_b_tx: txHashB,
      estimated_profit_wei: estimatedProfit.toString(),
      estimated_profit_eth: Number(estimatedProfit) / 1e18,
      run_id: runData?.id,
      status: 'EXECUTED',
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
