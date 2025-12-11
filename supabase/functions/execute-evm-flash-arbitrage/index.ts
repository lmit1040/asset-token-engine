/**
 * Execute EVM Flash Loan Arbitrage
 * 
 * This function executes capital-free arbitrage using flash loans from Aave V3 or Balancer.
 * 
 * ATOMIC MODE (with deployed receiver contract):
 * 1. Call receiver contract's executeArbitrage function
 * 2. Receiver initiates flash loan from Aave V3
 * 3. Aave calls executeOperation on receiver
 * 4. Receiver executes swap via whitelisted DEX router
 * 5. Receiver repays flash loan + premium
 * 6. Profit stays in receiver contract
 * 
 * LEGACY MODE (without receiver contract):
 * Executes swaps separately (requires upfront capital)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ethers } from "https://esm.sh/ethers@6.13.2";
import { getEvmOpsWallet } from "../_shared/evm-ops-wallet.ts";
import { getZeroXQuote } from "../_shared/zerox-client.ts";
import { 
  getFlashLoanContract, 
  calculateFlashLoanFee,
  AAVE_V3_POOL_ABI,
  ERC20_ABI,
  FLASH_LOAN_FEES_BPS,
  METALLUM_FLASH_RECEIVER_ABI,
} from "../_shared/flash-loan-providers.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHAIN_IDS: Record<string, number> = {
  POLYGON: 137,
  ETHEREUM: 1,
  ARBITRUM: 42161,
  BSC: 56,
};

const NETWORK_RPC_URLS: Record<string, string> = {
  POLYGON: "https://polygon-rpc.com",
  ETHEREUM: "https://eth.llamarpc.com",
  ARBITRUM: "https://arb1.arbitrum.io/rpc",
  BSC: "https://bsc-dataseed1.binance.org",
};

// 0x API for swap execution
const ZEROX_API_BASE_URL = "https://api.0x.org";

// Known DEX router addresses for whitelisting
const DEX_ROUTERS: Record<string, Record<string, string>> = {
  POLYGON: {
    "0x": "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", // 0x Exchange Proxy
    "UNISWAP_V3": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    "SUSHISWAP": "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
  },
  ETHEREUM: {
    "0x": "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
    "UNISWAP_V3": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  },
  ARBITRUM: {
    "0x": "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
    "UNISWAP_V3": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  },
  BSC: {
    "0x": "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
    "PANCAKESWAP": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  },
};

async function getZeroXSwapTransaction(params: {
  network: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress: string;
}): Promise<{ to: string; data: string; value: string; gas: string } | null> {
  const { network, sellToken, buyToken, sellAmount, takerAddress } = params;
  const chainId = CHAIN_IDS[network.toUpperCase()];
  const apiKey = Deno.env.get("ZEROX_API_KEY");

  if (!chainId || !apiKey) return null;

  const url = new URL(`${ZEROX_API_BASE_URL}/swap/allowance-holder/quote`);
  url.searchParams.set("sellToken", sellToken);
  url.searchParams.set("buyToken", buyToken);
  url.searchParams.set("sellAmount", sellAmount);
  url.searchParams.set("chainId", chainId.toString());
  url.searchParams.set("taker", takerAddress);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        "0x-api-key": apiKey,
        "0x-version": "v2",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.transaction) return null;

    return {
      to: data.transaction.to,
      data: data.transaction.data,
      value: data.transaction.value || "0",
      gas: data.transaction.gas || data.gas || "500000",
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[execute-evm-flash-arbitrage] Starting flash loan arbitrage...');

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
    const { strategy_id, simulate_only } = await req.json();
    if (!strategy_id) {
      return new Response(JSON.stringify({ error: 'strategy_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch strategy with flash loan config
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

    if (!strategy.use_flash_loan) {
      return new Response(JSON.stringify({ error: 'Flash loan not enabled for this strategy' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const network = strategy.evm_network || 'POLYGON';
    const providerName = strategy.flash_loan_provider || 'AAVE_V3';
    const flashLoanToken = strategy.flash_loan_token || strategy.token_in_mint;
    const flashLoanAmount = strategy.flash_loan_amount_native?.toString() || '1000000000000000000';
    
    console.log(`[execute-evm-flash-arbitrage] Strategy: ${strategy.name}`);
    console.log(`[execute-evm-flash-arbitrage] Network: ${network}, Provider: ${providerName}`);
    console.log(`[execute-evm-flash-arbitrage] Flash loan: ${flashLoanAmount} of ${flashLoanToken}`);

    const startedAt = new Date().toISOString();

    // Check for receiver contract in flash_loan_providers table
    const { data: providerRecord } = await supabase
      .from('flash_loan_providers')
      .select('*')
      .eq('name', providerName)
      .eq('chain', network)
      .eq('is_active', true)
      .maybeSingle();

    const receiverContractAddress = providerRecord?.receiver_contract_address;
    const hasReceiverContract = !!receiverContractAddress && receiverContractAddress.length === 42;
    
    console.log(`[execute-evm-flash-arbitrage] Receiver contract: ${hasReceiverContract ? receiverContractAddress : 'NOT DEPLOYED'}`);
    console.log(`[execute-evm-flash-arbitrage] Mode: ${hasReceiverContract ? 'ATOMIC' : 'LEGACY (separate legs)'}`);

    // Get flash loan pool contract
    const flashLoanPoolAddress = getFlashLoanContract(providerName, network);
    if (!flashLoanPoolAddress) {
      const errorMsg = `Flash loan provider ${providerName} not supported on ${network}`;
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        error_message: errorMsg,
        used_flash_loan: true,
        flash_loan_provider: providerName,
      });
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get OPS wallet for execution
    let opsWallet: ReturnType<typeof getEvmOpsWallet>;
    try {
      opsWallet = getEvmOpsWallet(network);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to initialize wallet';
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        error_message: errorMsg,
        used_flash_loan: true,
        flash_loan_provider: providerName,
      });
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const walletAddress = opsWallet.address;
    console.log(`[execute-evm-flash-arbitrage] Wallet: ${walletAddress}`);

    // Step 1: Simulate the arbitrage with flash loan amount
    console.log(`[execute-evm-flash-arbitrage] Simulating arbitrage with borrowed funds...`);
    
    // Determine taker address based on mode
    const takerAddress = hasReceiverContract ? receiverContractAddress : walletAddress;
    
    // Get quote for leg A (borrow token -> intermediate token)
    const quoteA = await getZeroXQuote({
      network,
      sellToken: flashLoanToken,
      buyToken: strategy.token_out_mint,
      sellAmount: flashLoanAmount,
      takerAddress,
    });

    if (!quoteA) {
      const errorMsg = 'Failed to get leg A quote for flash loan simulation';
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        error_message: errorMsg,
        used_flash_loan: true,
        flash_loan_provider: providerName,
        flash_loan_amount: flashLoanAmount,
      });
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[execute-evm-flash-arbitrage] Leg A: ${flashLoanAmount} -> ${quoteA.buyAmount}`);

    // Get quote for leg B (intermediate token -> borrow token)
    const quoteB = await getZeroXQuote({
      network,
      sellToken: strategy.token_out_mint,
      buyToken: flashLoanToken,
      sellAmount: quoteA.buyAmount,
      takerAddress,
    });

    if (!quoteB) {
      const errorMsg = 'Failed to get leg B quote for flash loan simulation';
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        error_message: errorMsg,
        used_flash_loan: true,
        flash_loan_provider: providerName,
        flash_loan_amount: flashLoanAmount,
      });
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[execute-evm-flash-arbitrage] Leg B: ${quoteA.buyAmount} -> ${quoteB.buyAmount}`);

    // Calculate profit after flash loan fee
    const borrowedAmount = BigInt(flashLoanAmount);
    const returnedAmount = BigInt(quoteB.buyAmount);
    const flashLoanFee = calculateFlashLoanFee(providerName, borrowedAmount);
    const totalRepayment = borrowedAmount + flashLoanFee;
    const grossProfit = returnedAmount - borrowedAmount;
    const netProfit = returnedAmount - totalRepayment;

    console.log(`[execute-evm-flash-arbitrage] Borrowed: ${borrowedAmount}`);
    console.log(`[execute-evm-flash-arbitrage] Returned: ${returnedAmount}`);
    console.log(`[execute-evm-flash-arbitrage] Flash loan fee: ${flashLoanFee} (${FLASH_LOAN_FEES_BPS[providerName] || 5} bps)`);
    console.log(`[execute-evm-flash-arbitrage] Gross profit: ${grossProfit}`);
    console.log(`[execute-evm-flash-arbitrage] Net profit (after fee): ${netProfit}`);

    // Check minimum profit threshold
    const minProfitThreshold = BigInt(strategy.min_expected_profit_native || 0);
    if (netProfit < minProfitThreshold) {
      const errorMsg = `Net profit ${netProfit} below threshold ${minProfitThreshold}`;
      console.log(`[execute-evm-flash-arbitrage] ${errorMsg}`);
      
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'SIMULATED',
        estimated_profit_lamports: Number(netProfit / 1_000_000_000n),
        error_message: errorMsg,
        used_flash_loan: true,
        flash_loan_provider: providerName,
        flash_loan_amount: flashLoanAmount,
        flash_loan_fee: flashLoanFee.toString(),
      });

      return new Response(JSON.stringify({
        success: false,
        message: 'Flash loan arbitrage not profitable',
        simulation: {
          borrowed_amount: borrowedAmount.toString(),
          returned_amount: returnedAmount.toString(),
          flash_loan_fee: flashLoanFee.toString(),
          gross_profit: grossProfit.toString(),
          net_profit: netProfit.toString(),
          min_threshold: minProfitThreshold.toString(),
        },
        status: 'SIMULATED',
        mode: hasReceiverContract ? 'ATOMIC' : 'LEGACY',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If simulate_only, return simulation results
    if (simulate_only) {
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'SIMULATED',
        estimated_profit_lamports: Number(netProfit / 1_000_000_000n),
        used_flash_loan: true,
        flash_loan_provider: providerName,
        flash_loan_amount: flashLoanAmount,
        flash_loan_fee: flashLoanFee.toString(),
        approved_for_auto_execution: netProfit > 0n,
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Flash loan arbitrage simulation profitable',
        simulation: {
          borrowed_amount: borrowedAmount.toString(),
          returned_amount: returnedAmount.toString(),
          flash_loan_fee: flashLoanFee.toString(),
          fee_bps: FLASH_LOAN_FEES_BPS[providerName] || 5,
          gross_profit: grossProfit.toString(),
          net_profit: netProfit.toString(),
          net_profit_eth: Number(netProfit) / 1e18,
          provider: providerName,
          network,
          receiver_contract: receiverContractAddress || null,
        },
        status: 'SIMULATED',
        mode: hasReceiverContract ? 'ATOMIC' : 'LEGACY',
        approved_for_execution: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // EXECUTION PHASE
    if (hasReceiverContract) {
      // =====================================================
      // ATOMIC MODE: Use deployed MetallumFlashReceiver contract
      // =====================================================
      console.log(`[execute-evm-flash-arbitrage] Executing ATOMIC flash loan via receiver contract...`);
      console.log(`[execute-evm-flash-arbitrage] Receiver: ${receiverContractAddress}`);
      
      // Get swap transaction data from 0x for the receiver to execute
      const swapTx = await getZeroXSwapTransaction({
        network,
        sellToken: flashLoanToken,
        buyToken: strategy.token_out_mint,
        sellAmount: flashLoanAmount,
        takerAddress: receiverContractAddress,
      });

      if (!swapTx) {
        const errorMsg = 'Failed to get swap transaction for atomic execution';
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          error_message: errorMsg,
          used_flash_loan: true,
          flash_loan_provider: providerName,
          flash_loan_amount: flashLoanAmount,
        });
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create receiver contract instance
      const receiverContract = new ethers.Contract(
        receiverContractAddress,
        METALLUM_FLASH_RECEIVER_ABI,
        opsWallet.wallet
      );

      // Verify the router is whitelisted (or whitelist it)
      const routerAddress = swapTx.to;
      try {
        const isWhitelisted = await receiverContract.whitelistedRouters(routerAddress);
        if (!isWhitelisted) {
          console.log(`[execute-evm-flash-arbitrage] Whitelisting router: ${routerAddress}`);
          const whitelistTx = await receiverContract.whitelistRouter(routerAddress, true);
          await whitelistTx.wait();
          console.log(`[execute-evm-flash-arbitrage] Router whitelisted`);
        }
      } catch (error) {
        console.log(`[execute-evm-flash-arbitrage] Could not verify router whitelist:`, error);
        // Continue anyway - the contract owner may have already whitelisted
      }

      // Execute atomic arbitrage via receiver contract
      console.log(`[execute-evm-flash-arbitrage] Calling executeArbitrage on receiver...`);
      let txHash: string;
      try {
        const arbTx = await receiverContract.executeArbitrage(
          flashLoanToken,    // asset to borrow
          flashLoanAmount,   // amount to borrow
          routerAddress,     // DEX router to use
          swapTx.data,       // swap calldata
          {
            gasLimit: 2_000_000n, // Higher gas for flash loan + swap
          }
        );
        
        console.log(`[execute-evm-flash-arbitrage] Transaction sent: ${arbTx.hash}`);
        const receipt = await arbTx.wait();
        txHash = arbTx.hash;
        
        console.log(`[execute-evm-flash-arbitrage] ATOMIC execution confirmed: ${txHash}`);
        console.log(`[execute-evm-flash-arbitrage] Gas used: ${receipt.gasUsed}`);

        // Check profit in receiver contract
        let contractProfit = 0n;
        try {
          contractProfit = await receiverContract.getContractBalance(flashLoanToken);
          console.log(`[execute-evm-flash-arbitrage] Profit in receiver: ${contractProfit}`);
        } catch {
          console.log(`[execute-evm-flash-arbitrage] Could not read contract balance`);
        }

        // Record successful atomic execution
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'EXECUTED',
          tx_signature: txHash,
          estimated_profit_lamports: Number(netProfit / 1_000_000_000n),
          actual_profit_lamports: Number(contractProfit / 1_000_000_000n),
          estimated_gas_cost_native: Number(receipt.gasUsed),
          used_flash_loan: true,
          flash_loan_provider: providerName,
          flash_loan_amount: flashLoanAmount,
          flash_loan_fee: flashLoanFee.toString(),
          run_type: 'ATOMIC',
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'ATOMIC flash loan arbitrage executed successfully',
          strategy_name: strategy.name,
          network,
          provider: providerName,
          receiver_contract: receiverContractAddress,
          tx_hash: txHash,
          borrowed_amount: borrowedAmount.toString(),
          flash_loan_fee: flashLoanFee.toString(),
          estimated_profit: netProfit.toString(),
          contract_profit: contractProfit.toString(),
          gas_used: receipt.gasUsed.toString(),
          mode: 'ATOMIC',
          status: 'EXECUTED',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Atomic execution failed';
        console.error(`[execute-evm-flash-arbitrage] ATOMIC execution error:`, error);
        
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          error_message: `ATOMIC: ${errorMsg}`,
          used_flash_loan: true,
          flash_loan_provider: providerName,
          flash_loan_amount: flashLoanAmount,
          flash_loan_fee: flashLoanFee.toString(),
          run_type: 'ATOMIC',
        });

        return new Response(JSON.stringify({ 
          error: errorMsg, 
          mode: 'ATOMIC',
          receiver_contract: receiverContractAddress,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

    } else {
      // =====================================================
      // LEGACY MODE: Execute legs separately (requires capital)
      // =====================================================
      console.log(`[execute-evm-flash-arbitrage] Executing LEGACY mode (separate legs)...`);
      console.log(`[execute-evm-flash-arbitrage] WARNING: No receiver contract deployed`);
      console.log(`[execute-evm-flash-arbitrage] This requires wallet to have token balance`);

      // Check wallet has enough balance for the borrow amount
      const tokenContract = new ethers.Contract(flashLoanToken, ERC20_ABI, opsWallet.wallet);
      let walletBalance: bigint;
      try {
        walletBalance = await tokenContract.balanceOf(walletAddress);
        console.log(`[execute-evm-flash-arbitrage] Wallet token balance: ${walletBalance}`);
      } catch {
        walletBalance = 0n;
      }

      if (walletBalance < borrowedAmount) {
        const errorMsg = `Insufficient balance: have ${walletBalance}, need ${borrowedAmount}. Deploy receiver contract for true capital-free execution.`;
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          estimated_profit_lamports: Number(netProfit / 1_000_000_000n),
          error_message: errorMsg,
          used_flash_loan: true,
          flash_loan_provider: providerName,
          flash_loan_amount: flashLoanAmount,
          flash_loan_fee: flashLoanFee.toString(),
          run_type: 'LEGACY',
        });
        return new Response(JSON.stringify({ 
          error: errorMsg,
          requires_receiver_contract: true,
          simulation: {
            borrowed_amount: borrowedAmount.toString(),
            net_profit: netProfit.toString(),
          },
          mode: 'LEGACY',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get executable swap transactions
      const swapTxA = await getZeroXSwapTransaction({
        network,
        sellToken: flashLoanToken,
        buyToken: strategy.token_out_mint,
        sellAmount: flashLoanAmount,
        takerAddress: walletAddress,
      });

      if (!swapTxA) {
        const errorMsg = 'Failed to get leg A swap transaction';
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          error_message: errorMsg,
          used_flash_loan: true,
          flash_loan_provider: providerName,
          run_type: 'LEGACY',
        });
        return new Response(JSON.stringify({ error: errorMsg, mode: 'LEGACY' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Approve tokens for swap
      const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
      try {
        const allowance = await tokenContract.allowance(walletAddress, PERMIT2_ADDRESS);
        if (BigInt(allowance.toString()) < borrowedAmount) {
          console.log(`[execute-evm-flash-arbitrage] Approving tokens...`);
          const approveTx = await tokenContract.approve(PERMIT2_ADDRESS, ethers.MaxUint256);
          await approveTx.wait();
        }
      } catch (error) {
        console.error(`[execute-evm-flash-arbitrage] Approval error:`, error);
      }

      // Execute leg A
      console.log(`[execute-evm-flash-arbitrage] Executing leg A...`);
      let txHashA: string;
      try {
        const txA = await opsWallet.wallet.sendTransaction({
          to: swapTxA.to,
          data: swapTxA.data,
          value: swapTxA.value,
          gasLimit: BigInt(swapTxA.gas) * 2n,
        });
        await txA.wait();
        txHashA = txA.hash;
        console.log(`[execute-evm-flash-arbitrage] Leg A confirmed: ${txHashA}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Leg A failed';
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          error_message: errorMsg,
          used_flash_loan: true,
          flash_loan_provider: providerName,
          run_type: 'LEGACY',
        });
        return new Response(JSON.stringify({ error: errorMsg, mode: 'LEGACY' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Execute leg B
      const swapTxB = await getZeroXSwapTransaction({
        network,
        sellToken: strategy.token_out_mint,
        buyToken: flashLoanToken,
        sellAmount: quoteA.buyAmount,
        takerAddress: walletAddress,
      });

      if (!swapTxB) {
        const errorMsg = 'Failed to get leg B swap transaction (leg A executed!)';
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          tx_signature: txHashA,
          error_message: errorMsg,
          used_flash_loan: true,
          flash_loan_provider: providerName,
          run_type: 'LEGACY',
        });
        return new Response(JSON.stringify({ error: errorMsg, leg_a_tx: txHashA, mode: 'LEGACY' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[execute-evm-flash-arbitrage] Executing leg B...`);
      let txHashB: string;
      try {
        const txB = await opsWallet.wallet.sendTransaction({
          to: swapTxB.to,
          data: swapTxB.data,
          value: swapTxB.value,
          gasLimit: BigInt(swapTxB.gas) * 2n,
        });
        await txB.wait();
        txHashB = txB.hash;
        console.log(`[execute-evm-flash-arbitrage] Leg B confirmed: ${txHashB}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Leg B failed';
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          tx_signature: txHashA,
          error_message: `Leg B failed: ${errorMsg}`,
          used_flash_loan: true,
          flash_loan_provider: providerName,
          run_type: 'LEGACY',
        });
        return new Response(JSON.stringify({ error: errorMsg, leg_a_tx: txHashA, mode: 'LEGACY' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Record successful legacy execution
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'EXECUTED',
        tx_signature: `${txHashA},${txHashB}`,
        estimated_profit_lamports: Number(netProfit / 1_000_000_000n),
        actual_profit_lamports: Number(netProfit / 1_000_000_000n),
        used_flash_loan: true,
        flash_loan_provider: providerName,
        flash_loan_amount: flashLoanAmount,
        flash_loan_fee: flashLoanFee.toString(),
        run_type: 'LEGACY',
      });

      console.log(`[execute-evm-flash-arbitrage] LEGACY mode completed successfully`);

      return new Response(JSON.stringify({
        success: true,
        message: 'Flash loan arbitrage executed (LEGACY mode - separate legs)',
        strategy_name: strategy.name,
        network,
        provider: providerName,
        wallet_used: walletAddress,
        leg_a_tx: txHashA,
        leg_b_tx: txHashB,
        borrowed_amount: borrowedAmount.toString(),
        flash_loan_fee: flashLoanFee.toString(),
        gross_profit: grossProfit.toString(),
        net_profit: netProfit.toString(),
        net_profit_eth: Number(netProfit) / 1e18,
        mode: 'LEGACY',
        status: 'EXECUTED',
        note: 'Deploy receiver contract for true atomic flash loan execution.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('[execute-evm-flash-arbitrage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
