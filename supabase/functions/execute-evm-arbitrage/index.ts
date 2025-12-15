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

// Testnet networks where 0x API is not available
const TESTNET_NETWORKS = ['SEPOLIA', 'POLYGON_AMOY', 'ARBITRUM_SEPOLIA', 'BSC_TESTNET'];

function isTestnetNetwork(network: string): boolean {
  return TESTNET_NETWORKS.includes(network.toUpperCase());
}

// Mock quote generator for testnets (simulates realistic price behavior)
function getMockQuote(sellAmount: string): { buyAmount: string; sources: string[] } {
  const sellAmountBigInt = BigInt(sellAmount);
  // Simulate a 0.1-0.5% price spread (random)
  const spreadBps = 10 + Math.floor(Math.random() * 40); // 10-50 bps
  const buyAmount = sellAmountBigInt - (sellAmountBigInt * BigInt(spreadBps)) / 10000n;
  return {
    buyAmount: buyAmount.toString(),
    sources: ['Mock DEX (testnet simulation)'],
  };
}

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

// 0x API v2 base URL (same for all chains)
const ZEROX_API_BASE_URL = "https://api.0x.org";

// Get executable swap transaction from 0x API v2
async function getZeroXSwapTransaction(params: {
  network: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress: string;
}): Promise<{ to: string; data: string; value: string; gas: string; gasPrice: string } | null> {
  const { network, sellToken, buyToken, sellAmount, takerAddress } = params;
  const normalizedNetwork = network.toUpperCase();
  
  const chainId = CHAIN_IDS[normalizedNetwork];
  const apiKey = Deno.env.get("ZEROX_API_KEY");

  if (!chainId) {
    console.error(`[execute-evm-arbitrage] Unsupported network: ${normalizedNetwork}`);
    return null;
  }

  if (!apiKey) {
    console.error(`[execute-evm-arbitrage] ZEROX_API_KEY is required for 0x API v2`);
    return null;
  }

  // Use v2 allowance-holder/quote endpoint which returns executable transaction data
  // 0x API v2 uses single base URL with chainId parameter
  const url = new URL(`${ZEROX_API_BASE_URL}/swap/allowance-holder/quote`);
  url.searchParams.set("sellToken", sellToken);
  url.searchParams.set("buyToken", buyToken);
  url.searchParams.set("sellAmount", sellAmount);
  url.searchParams.set("chainId", chainId.toString());
  url.searchParams.set("taker", takerAddress);

  console.log(`[execute-evm-arbitrage] Fetching swap tx: ${sellToken} -> ${buyToken} (v2 API)`);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "0x-api-key": apiKey,
      "0x-version": "v2",
    };

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
): Promise<{ success: boolean; error?: string }> {
  const erc20Abi = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ];

  try {
    const token = new ethers.Contract(tokenAddress, erc20Abi, wallet);
    const currentAllowance = await token.allowance(wallet.address, spender);
    
    if (BigInt(currentAllowance.toString()) >= BigInt(amount)) {
      console.log(`[execute-evm-arbitrage] Sufficient allowance exists`);
      return { success: true };
    }

    console.log(`[execute-evm-arbitrage] Approving token spend...`);
    const approveTx = await token.approve(spender, ethers.MaxUint256);
    await approveTx.wait();
    console.log(`[execute-evm-arbitrage] Approval confirmed: ${approveTx.hash}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[execute-evm-arbitrage] Approval failed:`, error);
    
    // Provide actionable error messages
    if (errorMessage.includes('insufficient funds')) {
      const walletAddress = wallet.address;
      return { 
        success: false, 
        error: `Insufficient gas balance in wallet ${walletAddress}. Please fund the wallet with native tokens (ETH/MATIC/BNB) to pay for gas fees.`
      };
    }
    
    return { success: false, error: `Token approval failed: ${errorMessage}` };
  }
}

// ============ NET PROFIT WATERFALL CALCULATION ============
interface NetProfitWaterfall {
  grossProfit: bigint;
  estimatedGasCost: bigint;
  slippageBuffer: bigint;
  protocolFees: bigint;
  netProfit: bigint;
  profitBps: number;
}

function calculateNetProfitWaterfall(params: {
  initialAmountIn: bigint;
  finalAmountOut: bigint;
  gasEstimateLegA: bigint;
  gasEstimateLegB: bigint;
  effectiveGasPrice: bigint;
  slippageBps?: number; // default 50 bps (0.5%)
  protocolFeeBps?: number; // 0x fee, default 0
}): NetProfitWaterfall {
  const {
    initialAmountIn,
    finalAmountOut,
    gasEstimateLegA,
    gasEstimateLegB,
    effectiveGasPrice,
    slippageBps = 50,
    protocolFeeBps = 0,
  } = params;

  const grossProfit = finalAmountOut - initialAmountIn;
  const totalGasEstimate = gasEstimateLegA + gasEstimateLegB;
  const estimatedGasCost = totalGasEstimate * effectiveGasPrice;
  const slippageBuffer = (initialAmountIn * BigInt(slippageBps)) / 10000n;
  const protocolFees = (initialAmountIn * BigInt(protocolFeeBps)) / 10000n;
  const netProfit = grossProfit - estimatedGasCost - slippageBuffer - protocolFees;
  const profitBps = initialAmountIn > 0n 
    ? Number((netProfit * 10000n) / initialAmountIn) 
    : 0;

  return {
    grossProfit,
    estimatedGasCost,
    slippageBuffer,
    protocolFees,
    netProfit,
    profitBps,
  };
}

// ============ BALANCE SNAPSHOT FOR REALIZED PROFIT ============
interface BalanceSnapshot {
  gasTokenBalance: bigint; // Native token (ETH/MATIC/BNB)
  profitTokenBalance: bigint; // The token we're measuring profit in
}

async function captureBalanceSnapshot(
  provider: ethers.Provider,
  walletAddress: string,
  profitTokenAddress: string
): Promise<BalanceSnapshot> {
  const erc20Abi = ["function balanceOf(address) view returns (uint256)"];
  
  // Get native gas token balance
  const gasTokenBalance = await provider.getBalance(walletAddress);
  
  // Get profit token balance (handle native token case)
  let profitTokenBalance = 0n;
  const isNativeToken = profitTokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  
  if (isNativeToken) {
    profitTokenBalance = gasTokenBalance;
  } else {
    try {
      const tokenContract = new ethers.Contract(profitTokenAddress, erc20Abi, provider);
      profitTokenBalance = await tokenContract.balanceOf(walletAddress);
    } catch (error) {
      console.warn(`[execute-evm-arbitrage] Failed to get token balance:`, error);
    }
  }

  return { gasTokenBalance, profitTokenBalance };
}

function calculateRealizedProfit(
  preTx: BalanceSnapshot,
  postTx: BalanceSnapshot
): { realizedProfit: bigint; gasSpent: bigint } {
  const realizedProfit = postTx.profitTokenBalance - preTx.profitTokenBalance;
  const gasSpent = preTx.gasTokenBalance - postTx.gasTokenBalance;
  return { realizedProfit, gasSpent };
}

// ============ PNL ALERT CONFIGURATION ============
const PNL_ALERT_NEGATIVE_REALIZED = Deno.env.get('PNL_ALERT_NEGATIVE_REALIZED') !== 'false'; // Default true
const PNL_ALERT_MAX_NEGATIVE_PROFIT_WEI = BigInt(Deno.env.get('PNL_ALERT_MAX_NEGATIVE_PROFIT_WEI') || '0');
const PNL_ALERT_MIN_RATIO = parseFloat(Deno.env.get('PNL_ALERT_MIN_RATIO') || '0.50');
const PNL_ALERT_MAX_GAS_MULTIPLIER = parseFloat(Deno.env.get('PNL_ALERT_MAX_GAS_MULTIPLIER') || '1.50');
const PNL_FAIL_MAX_CONSECUTIVE = parseInt(Deno.env.get('PNL_FAIL_MAX_CONSECUTIVE') || '3', 10);
const PNL_FAIL_WINDOW_MINUTES = parseInt(Deno.env.get('PNL_FAIL_WINDOW_MINUTES') || '60', 10);

interface PnlDiscrepancy {
  pnlDelta: bigint;
  pnlRatio: number;
  isAlert: boolean;
  alertType: string | null;
  severity: 'info' | 'warning' | 'critical';
  reason: string | null;
}

// Evaluate PnL discrepancy after each run
function evaluatePnlDiscrepancy(params: {
  expectedNetProfit: bigint;
  realizedProfit: bigint;
  estimatedGasCost: bigint;
  actualGasSpent: bigint;
}): PnlDiscrepancy {
  const { expectedNetProfit, realizedProfit, estimatedGasCost, actualGasSpent } = params;
  
  const pnlDelta = realizedProfit - expectedNetProfit;
  const safeExpected = expectedNetProfit > 0n ? expectedNetProfit : 1n;
  const pnlRatio = Number(realizedProfit) / Number(safeExpected);
  
  let isAlert = false;
  let alertType: string | null = null;
  let severity: 'info' | 'warning' | 'critical' = 'info';
  let reason: string | null = null;

  // Check for negative realized profit
  if (PNL_ALERT_NEGATIVE_REALIZED && realizedProfit < PNL_ALERT_MAX_NEGATIVE_PROFIT_WEI) {
    isAlert = true;
    alertType = 'NEGATIVE_REALIZED_PROFIT';
    severity = 'critical';
    reason = `Realized profit ${realizedProfit} is below threshold ${PNL_ALERT_MAX_NEGATIVE_PROFIT_WEI}`;
  }
  
  // Check for low ratio (realized < X% of expected)
  else if (pnlRatio < PNL_ALERT_MIN_RATIO && expectedNetProfit > 0n) {
    isAlert = true;
    alertType = 'LOW_PROFIT_RATIO';
    severity = 'warning';
    reason = `Realized/Expected ratio ${pnlRatio.toFixed(2)} below minimum ${PNL_ALERT_MIN_RATIO}`;
  }
  
  // Check for excessive gas spend
  const gasRatio = estimatedGasCost > 0n ? Number(actualGasSpent) / Number(estimatedGasCost) : 0;
  if (gasRatio > PNL_ALERT_MAX_GAS_MULTIPLIER) {
    isAlert = true;
    alertType = 'EXCESSIVE_GAS_SPEND';
    severity = severity === 'critical' ? 'critical' : 'warning';
    reason = `Gas multiplier ${gasRatio.toFixed(2)}x exceeds max ${PNL_ALERT_MAX_GAS_MULTIPLIER}x`;
  }

  return { pnlDelta, pnlRatio, isAlert, alertType, severity, reason };
}

// Log alert to ops_arbitrage_alerts table
async function logPnlAlert(
  supabase: any,
  params: {
    network: string;
    chain?: string;
    run_id?: string;
    alert_type: string;
    severity: string;
    expected_net_profit: string;
    realized_profit: string;
    gas_spent: string;
    details_json: Record<string, any>;
  }
): Promise<void> {
  try {
    await supabase.from('ops_arbitrage_alerts').insert({
      network: params.network,
      chain: params.chain || 'EVM',
      run_id: params.run_id,
      alert_type: params.alert_type,
      severity: params.severity,
      expected_net_profit: params.expected_net_profit,
      realized_profit: params.realized_profit,
      gas_spent: params.gas_spent,
      details_json: params.details_json,
    });
    console.log(`[execute-evm-arbitrage] Logged PnL alert: ${params.alert_type} (${params.severity})`);
  } catch (error) {
    console.error('[execute-evm-arbitrage] Failed to log PnL alert:', error);
  }
}

// Check consecutive failures and auto-lock if needed
async function checkAndAutoLock(supabase: any, network: string): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - PNL_FAIL_WINDOW_MINUTES * 60 * 1000).toISOString();
    
    // Count recent critical/warning alerts
    const { data: recentAlerts, error } = await supabase
      .from('ops_arbitrage_alerts')
      .select('id, alert_type, severity')
      .eq('network', network.toLowerCase())
      .gte('created_at', windowStart)
      .in('severity', ['critical', 'warning'])
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(PNL_FAIL_MAX_CONSECUTIVE + 1);

    if (error) {
      console.error('[execute-evm-arbitrage] Failed to check recent alerts:', error);
      return false;
    }

    // Check if we hit the consecutive failure threshold
    if (recentAlerts && recentAlerts.length >= PNL_FAIL_MAX_CONSECUTIVE) {
      console.warn(`[execute-evm-arbitrage] CONSECUTIVE FAILURE THRESHOLD HIT: ${recentAlerts.length} alerts in last ${PNL_FAIL_WINDOW_MINUTES} minutes`);
      
      // Auto-lock execution
      const { error: lockError } = await supabase
        .from('system_settings')
        .update({
          arb_execution_locked: true,
          arb_execution_locked_at: new Date().toISOString(),
          arb_execution_locked_reason: `Auto-locked: ${recentAlerts.length} consecutive alerts in ${PNL_FAIL_WINDOW_MINUTES} min window`,
        })
        .eq('id', (await supabase.from('system_settings').select('id').limit(1).single()).data?.id);

      if (lockError) {
        console.error('[execute-evm-arbitrage] Failed to auto-lock:', lockError);
        return false;
      }

      console.warn('[execute-evm-arbitrage] EXECUTION AUTO-LOCKED');
      
      // Log a critical alert for the lock event
      await logPnlAlert(supabase, {
        network,
        alert_type: 'EXECUTION_AUTO_LOCKED',
        severity: 'critical',
        expected_net_profit: '0',
        realized_profit: '0',
        gas_spent: '0',
        details_json: {
          consecutive_alerts: recentAlerts.length,
          window_minutes: PNL_FAIL_WINDOW_MINUTES,
          threshold: PNL_FAIL_MAX_CONSECUTIVE,
          reason: 'Too many consecutive failures triggered auto-lock',
        },
      });

      return true;
    }

    return false;
  } catch (error) {
    console.error('[execute-evm-arbitrage] checkAndAutoLock error:', error);
    return false;
  }
}

// Check if execution is locked
async function isExecutionLocked(supabase: any): Promise<{ locked: boolean; reason: string | null }> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('arb_execution_locked, arb_execution_locked_reason')
      .limit(1)
      .single();
    
    return {
      locked: data?.arb_execution_locked === true,
      reason: data?.arb_execution_locked_reason || null,
    };
  } catch {
    return { locked: false, reason: null };
  }
}

// Helper to log ops arbitrage events
async function logOpsArbitrageEvent(
  supabase: any,
  params: {
    chain?: string;
    network: string;
    mode: 'SIMULATION' | 'OPS_REFILL';
    strategy_id?: string;
    run_id?: string;
    notional_in?: string;
    expected_gross_profit?: string;
    expected_net_profit?: string;
    realized_profit?: string;
    gas_used?: string;
    effective_gas_price?: string;
    tx_hash?: string;
    status: 'SIMULATED' | 'EXECUTED' | 'ABORTED' | 'REJECTED' | 'FAILED';
    error_message?: string;
  }
): Promise<string | null> {
  try {
    const { data } = await supabase.from('ops_arbitrage_events').insert({
      chain: params.chain || 'EVM',
      network: params.network,
      mode: params.mode,
      strategy_id: params.strategy_id,
      run_id: params.run_id,
      notional_in: params.notional_in,
      expected_gross_profit: params.expected_gross_profit,
      expected_net_profit: params.expected_net_profit,
      realized_profit: params.realized_profit,
      gas_used: params.gas_used,
      effective_gas_price: params.effective_gas_price,
      tx_hash: params.tx_hash,
      status: params.status,
      error_message: params.error_message,
    }).select('id').single();
    return data?.id || null;
  } catch (error) {
    console.error('[execute-evm-arbitrage] Failed to log ops event:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[execute-evm-arbitrage] Starting EVM arbitrage execution...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ============ ENVIRONMENT VALIDATION ============
    const arbEnv = Deno.env.get('ARB_ENV') || 'devnet';
    const arbExecutionEnabled = Deno.env.get('ARB_EXECUTION_ENABLED') === 'true';
    const evmOpsPrivateKey = Deno.env.get('EVM_OPS_PRIVATE_KEY');
    const evmRpcUrl = Deno.env.get('EVM_POLYGON_RPC_URL');
    
    console.log(`[execute-evm-arbitrage] ARB_ENV: ${arbEnv}, ARB_EXECUTION_ENABLED: ${arbExecutionEnabled}`);

    // Kill switch check - if not enabled, always simulate
    if (!arbExecutionEnabled) {
      console.log('[execute-evm-arbitrage] ARB_EXECUTION_ENABLED=false, forcing simulation mode');
    }

    // Mainnet requires EVM_OPS_PRIVATE_KEY and EVM_RPC_URL
    if (arbEnv === 'mainnet') {
      if (!evmOpsPrivateKey) {
        const errorMsg = 'EVM_OPS_PRIVATE_KEY is required for mainnet execution';
        console.error(`[execute-evm-arbitrage] ${errorMsg}`);
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!evmRpcUrl) {
        const errorMsg = 'EVM_POLYGON_RPC_URL is required for mainnet execution';
        console.error(`[execute-evm-arbitrage] ${errorMsg}`);
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ============ ADMIN AUTHENTICATION ============
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // ============ PARSE REQUEST ============
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
    const isTestnet = isTestnetNetwork(network);

    // ============ MAINNET CHAIN ID VALIDATION ============
    if (arbEnv === 'mainnet' && !isTestnet) {
      const expectedChainId = CHAIN_IDS[network.toUpperCase()];
      if (network.toUpperCase() === 'POLYGON' && expectedChainId !== 137) {
        const errorMsg = `Invalid chain configuration: Expected Polygon mainnet (137), got ${expectedChainId}`;
        console.error(`[execute-evm-arbitrage] ${errorMsg}`);
        await logOpsArbitrageEvent(supabase, {
          network,
          mode: 'SIMULATION',
          strategy_id: strategy.id,
          status: 'FAILED',
          error_message: errorMsg,
        });
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Check if mainnet mode is enabled in system settings
    const { data: systemSettings } = await supabase
      .from('system_settings')
      .select('is_mainnet_mode, mainnet_min_profit_to_gas_ratio, evm_min_fee_payer_balance_native, arb_execution_locked, arb_execution_locked_reason')
      .limit(1)
      .maybeSingle();

    const isMainnetMode = systemSettings?.is_mainnet_mode === true;
    
    // ============ EXECUTION LOCK CHECK ============
    if (systemSettings?.arb_execution_locked === true) {
      const lockReason = systemSettings.arb_execution_locked_reason || 'Execution locked by safety system';
      console.error(`[execute-evm-arbitrage] EXECUTION LOCKED: ${lockReason}`);
      
      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'SIMULATION',
        strategy_id: strategy.id,
        status: 'ABORTED',
        error_message: `EXECUTION_LOCKED: ${lockReason}`,
      });
      
      return new Response(JSON.stringify({ 
        error: 'Execution locked', 
        reason: lockReason,
        status: 'LOCKED',
        action_required: 'Admin must acknowledge alerts and unlock execution in dashboard',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Determine execution mode based on multiple gates
    // Must pass ALL gates to execute real swaps:
    // 1. ARB_ENV == mainnet
    // 2. ARB_EXECUTION_ENABLED == true
    // 3. is_mainnet_mode == true in system_settings
    // 4. Not a testnet network
    // 5. arb_execution_locked == false
    const canExecuteReal = arbEnv === 'mainnet' && arbExecutionEnabled && isMainnetMode && !isTestnet;
    const shouldSimulate = !canExecuteReal;
    const executionMode = canExecuteReal ? 'OPS_REFILL' : 'SIMULATION';

    if (shouldSimulate) {
      const reason = isTestnet ? `Testnet network (${network})` : 'Mainnet mode disabled';
      console.log(`[execute-evm-arbitrage] Running in simulation mode: ${reason}`);
    } else {
      console.log(`[execute-evm-arbitrage] MAINNET MODE: Real trades will be executed`);
    }

    // Try to get a fee payer from the rotation pool first, fall back to OPS wallet
    let executionWallet: ethers.Wallet;
    let walletAddress: string;
    let usedFeePayer: { feePayerId: string } | null = null;

    // Minimum gas balance required (in native token - ETH/MATIC/etc)
    const MIN_GAS_BALANCE = 0.005; // 0.005 native token minimum for gas

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

    // Check wallet balance BEFORE attempting any transactions (only for real execution)
    if (!shouldSimulate) {
      try {
        const balanceWei = await executionWallet.provider?.getBalance(walletAddress);
        const balanceNative = balanceWei ? parseFloat(ethers.formatEther(balanceWei)) : 0;
        
        console.log(`[execute-evm-arbitrage] Wallet ${walletAddress} balance: ${balanceNative} native tokens`);
        
        if (balanceNative < MIN_GAS_BALANCE) {
          const nativeSymbol = network === 'POLYGON' ? 'MATIC' : network === 'BSC' ? 'BNB' : 'ETH';
          const errorMsg = `Insufficient gas balance: Wallet ${walletAddress} has ${balanceNative.toFixed(6)} ${nativeSymbol}, but needs at least ${MIN_GAS_BALANCE} ${nativeSymbol} for gas. Please fund the wallet before executing trades.`;
          
          console.error(`[execute-evm-arbitrage] ${errorMsg}`);
          
          await supabase.from('arbitrage_runs').insert({
            strategy_id: strategy.id,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            status: 'FAILED',
            error_message: errorMsg,
            run_type: 'EXECUTE',
            purpose: 'MANUAL',
          });

          return new Response(JSON.stringify({ 
            error: 'Insufficient gas balance',
            details: errorMsg,
            wallet_address: walletAddress,
            current_balance: balanceNative,
            required_balance: MIN_GAS_BALANCE,
            native_symbol: nativeSymbol,
            network: network,
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (balanceError) {
        console.warn(`[execute-evm-arbitrage] Could not check balance:`, balanceError);
        // Continue anyway - the transaction will fail with a clear error if balance is insufficient
      }
    }

    // Get trade size from env or use default
    const maxNotionalWei = Deno.env.get('MAX_NOTIONAL_WEI') || '10000000000000000'; // 0.01 ETH default
    const minNetProfitWei = BigInt(Deno.env.get('MIN_NET_PROFIT_WEI') || '100000000000000'); // 0.0001 ETH default
    const minProfitBps = parseInt(Deno.env.get('MIN_PROFIT_BPS') || '10', 10); // 10 bps default
    
    const inputWei = maxNotionalWei;
    console.log(`[execute-evm-arbitrage] Trade size: ${inputWei} wei, Min profit: ${minNetProfitWei} wei (${minProfitBps} bps)`);

    // ============ SIMULATED EXECUTION ============
    if (shouldSimulate) {
      let simulationReason = 'Unknown';
      if (isTestnet) {
        simulationReason = `Testnet network (${network}) - 0x API not available`;
      } else if (!arbExecutionEnabled) {
        simulationReason = 'ARB_EXECUTION_ENABLED=false (kill switch active)';
      } else if (arbEnv !== 'mainnet') {
        simulationReason = `ARB_ENV=${arbEnv} (not mainnet)`;
      } else if (!isMainnetMode) {
        simulationReason = 'is_mainnet_mode=false in system settings';
      }
      
      console.log(`[execute-evm-arbitrage] Running simulated execution: ${simulationReason}`);
      
      // Generate mock quotes
      const mockQuoteA = getMockQuote(inputWei);
      const mockQuoteB = getMockQuote(mockQuoteA.buyAmount);
      
      // Calculate simulated profit (usually slightly negative due to spread)
      const inputBigInt = BigInt(inputWei);
      const outputBigInt = BigInt(mockQuoteB.buyAmount);
      const simulatedProfit = outputBigInt - inputBigInt;
      
      console.log(`[execute-evm-arbitrage] Simulated leg A output: ${mockQuoteA.buyAmount}`);
      console.log(`[execute-evm-arbitrage] Simulated leg B output: ${mockQuoteB.buyAmount}`);
      console.log(`[execute-evm-arbitrage] Simulated profit: ${simulatedProfit} wei`);
      
      // Record as simulated run
      const finishedAt = new Date().toISOString();
      const { data: runData } = await supabase
        .from('arbitrage_runs')
        .insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: finishedAt,
          status: 'SIMULATED',
          estimated_profit_lamports: Number(simulatedProfit / 1_000_000_000n),
          error_message: simulationReason,
        })
        .select()
        .maybeSingle();

      // Log to ops_arbitrage_events
      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'SIMULATION',
        strategy_id: strategy.id,
        run_id: runData?.id,
        notional_in: inputWei,
        expected_gross_profit: simulatedProfit.toString(),
        expected_net_profit: simulatedProfit.toString(),
        status: 'SIMULATED',
        error_message: simulationReason,
      });

      return new Response(JSON.stringify({
        success: true,
        message: `Simulation mode: ${simulationReason}`,
        strategy_name: strategy.name,
        network,
        wallet_used: walletAddress,
        execution_mode: executionMode,
        arb_env: arbEnv,
        arb_execution_enabled: arbExecutionEnabled,
        is_mainnet_mode: isMainnetMode,
        is_testnet: isTestnet,
        simulated: true,
        leg_a_output: mockQuoteA.buyAmount,
        leg_b_output: mockQuoteB.buyAmount,
        estimated_profit_wei: simulatedProfit.toString(),
        estimated_profit_eth: Number(simulatedProfit) / 1e18,
        run_id: runData?.id,
        status: 'SIMULATED',
        note: simulationReason,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // ============ MAINNET EXECUTION GATE LOG ============
    console.log(`[execute-evm-arbitrage] MAINNET OPS_REFILL MODE: Real trades will be executed`);
    console.log(`[execute-evm-arbitrage] Chain: ${network}, ChainId: ${CHAIN_IDS[network.toUpperCase()]}`);
    console.log(`[execute-evm-arbitrage] ARB_ENV: ${arbEnv}, EXECUTION_ENABLED: ${arbExecutionEnabled}`);

    // Validate notional against max limit
    const inputBigInt = BigInt(inputWei);
    const maxNotionalLimit = BigInt(Deno.env.get('MAX_NOTIONAL_WEI') || '50000000000000000000'); // 50 ETH default cap
    
    if (inputBigInt > maxNotionalLimit) {
      const errorMsg = `Notional ${inputWei} wei exceeds MAX_NOTIONAL_WEI limit ${maxNotionalLimit}`;
      console.error(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'OPS_REFILL',
        strategy_id: strategy.id,
        notional_in: inputWei,
        status: 'ABORTED',
        error_message: errorMsg,
      });
      
      return new Response(JSON.stringify({ error: errorMsg, status: 'ABORTED' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ MAINNET REAL EXECUTION ============
    // Step 1: Get quote for leg A with gas estimation
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

    // MOCK QUOTE SAFETY CHECK
    if ((quoteA as any).isMock) {
      const errorMsg = 'Leg A quote is mock - execution aborted for safety';
      console.error(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'OPS_REFILL',
        strategy_id: strategy.id,
        notional_in: inputWei,
        status: 'ABORTED',
        error_message: errorMsg,
      });
      
      return new Response(JSON.stringify({ error: errorMsg, status: 'ABORTED' }), {
        status: 400,
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

    // MOCK QUOTE SAFETY CHECK
    if ((quoteB as any).isMock) {
      const errorMsg = 'Leg B quote is mock - execution aborted for safety';
      console.error(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'OPS_REFILL',
        strategy_id: strategy.id,
        notional_in: inputWei,
        expected_gross_profit: (BigInt(quoteB.buyAmount) - inputBigInt).toString(),
        status: 'ABORTED',
        error_message: errorMsg,
      });
      
      return new Response(JSON.stringify({ error: errorMsg, status: 'ABORTED' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Get current gas price for accurate cost estimation
    let effectiveGasPrice: bigint;
    try {
      const feeData = await executionWallet.provider?.getFeeData();
      effectiveGasPrice = feeData?.gasPrice || ethers.parseUnits('50', 'gwei');
      console.log(`[execute-evm-arbitrage] Current gas price: ${ethers.formatUnits(effectiveGasPrice, 'gwei')} gwei`);
    } catch (gasPriceError) {
      console.warn(`[execute-evm-arbitrage] Failed to get gas price, using default`);
      effectiveGasPrice = ethers.parseUnits('50', 'gwei');
    }

    // Estimate gas for both legs (use higher estimates for safety)
    const gasEstimateLegA = BigInt(500000); // Conservative estimate for DEX swap
    const gasEstimateLegB = BigInt(500000);

    // ============ NET PROFIT WATERFALL CALCULATION ============
    const waterfall = calculateNetProfitWaterfall({
      initialAmountIn: inputBigInt,
      finalAmountOut: BigInt(quoteB.buyAmount),
      gasEstimateLegA,
      gasEstimateLegB,
      effectiveGasPrice,
      slippageBps: 50, // 0.5% slippage buffer
      protocolFeeBps: 0, // 0x has no protocol fee for now
    });

    console.log(`[execute-evm-arbitrage] === NET PROFIT WATERFALL ===`);
    console.log(`[execute-evm-arbitrage] Gross Profit: ${waterfall.grossProfit} wei (${Number(waterfall.grossProfit) / 1e18} ETH)`);
    console.log(`[execute-evm-arbitrage] Est Gas Cost: ${waterfall.estimatedGasCost} wei (${Number(waterfall.estimatedGasCost) / 1e18} ETH)`);
    console.log(`[execute-evm-arbitrage] Slippage Buffer: ${waterfall.slippageBuffer} wei`);
    console.log(`[execute-evm-arbitrage] Protocol Fees: ${waterfall.protocolFees} wei`);
    console.log(`[execute-evm-arbitrage] NET PROFIT: ${waterfall.netProfit} wei (${waterfall.profitBps} bps)`);
    console.log(`[execute-evm-arbitrage] ===========================`);

    // ============ STRICT EXECUTION GATES ============
    // Gate 1: Must have positive net profit
    if (waterfall.netProfit <= 0n) {
      const errorMsg = `Unprofitable after costs: net=${waterfall.netProfit} wei (gross=${waterfall.grossProfit}, gas=${waterfall.estimatedGasCost})`;
      console.log(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'SIMULATED',
        estimated_profit_lamports: Number(waterfall.netProfit / 1_000_000_000n),
        estimated_gas_cost_native: Number(waterfall.estimatedGasCost / 1_000_000_000n),
        error_message: errorMsg,
      });

      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'OPS_REFILL',
        strategy_id: strategy.id,
        notional_in: inputWei,
        expected_gross_profit: waterfall.grossProfit.toString(),
        expected_net_profit: waterfall.netProfit.toString(),
        effective_gas_price: effectiveGasPrice.toString(),
        status: 'REJECTED',
        error_message: errorMsg,
      });

      return new Response(JSON.stringify({
        success: false,
        message: 'Trade not profitable after costs',
        gross_profit_wei: waterfall.grossProfit.toString(),
        estimated_gas_cost_wei: waterfall.estimatedGasCost.toString(),
        net_profit_wei: waterfall.netProfit.toString(),
        status: 'REJECTED',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Gate 2: Net profit must exceed minimum threshold
    if (waterfall.netProfit < minNetProfitWei) {
      const errorMsg = `Net profit ${waterfall.netProfit} wei below minimum ${minNetProfitWei} wei`;
      console.log(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'OPS_REFILL',
        strategy_id: strategy.id,
        notional_in: inputWei,
        expected_gross_profit: waterfall.grossProfit.toString(),
        expected_net_profit: waterfall.netProfit.toString(),
        effective_gas_price: effectiveGasPrice.toString(),
        status: 'REJECTED',
        error_message: errorMsg,
      });

      return new Response(JSON.stringify({
        success: false,
        message: errorMsg,
        net_profit_wei: waterfall.netProfit.toString(),
        min_required_wei: minNetProfitWei.toString(),
        status: 'REJECTED',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Gate 3: Profit BPS must exceed minimum
    if (waterfall.profitBps < minProfitBps) {
      const errorMsg = `Net profit ${waterfall.profitBps} bps below minimum ${minProfitBps} bps`;
      console.log(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'OPS_REFILL',
        strategy_id: strategy.id,
        notional_in: inputWei,
        expected_gross_profit: waterfall.grossProfit.toString(),
        expected_net_profit: waterfall.netProfit.toString(),
        effective_gas_price: effectiveGasPrice.toString(),
        status: 'REJECTED',
        error_message: errorMsg,
      });

      return new Response(JSON.stringify({
        success: false,
        message: errorMsg,
        profit_bps: waterfall.profitBps,
        min_required_bps: minProfitBps,
        status: 'REJECTED',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[execute-evm-arbitrage] Profit validation passed: ${waterfall.netProfit} wei (${waterfall.profitBps} bps)`);

    // ============ CAPTURE PRE-EXECUTION BALANCE SNAPSHOT ============
    let preBalanceSnapshot: BalanceSnapshot | null = null;
    try {
      if (executionWallet.provider) {
        preBalanceSnapshot = await captureBalanceSnapshot(
          executionWallet.provider,
          walletAddress,
          strategy.token_in_mint
        );
        console.log(`[execute-evm-arbitrage] Pre-execution snapshot: gas=${preBalanceSnapshot.gasTokenBalance}, profit=${preBalanceSnapshot.profitTokenBalance}`);
      }
    } catch (snapshotError) {
      console.warn(`[execute-evm-arbitrage] Failed to capture pre-execution snapshot:`, snapshotError);
    }

    // Step 4: Get executable swap transaction for leg A
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
        estimated_profit_lamports: Number(waterfall.netProfit / 1_000_000_000n),
        estimated_gas_cost_native: Number(waterfall.estimatedGasCost / 1_000_000_000n),
        error_message: errorMsg,
      });
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 5: Approve token if needed (for non-native tokens)
    const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
    
    // Check if selling native token (ETH/MATIC)
    const isNativeToken = strategy.token_in_mint.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    
    if (!isNativeToken) {
      const approvalResult = await approveTokenIfNeeded(
        executionWallet,
        strategy.token_in_mint,
        PERMIT2_ADDRESS,
        inputWei
      );
      
      if (!approvalResult.success) {
        const errorMsg = approvalResult.error || 'Token approval failed';
        await supabase.from('arbitrage_runs').insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'FAILED',
          estimated_profit_lamports: Number(waterfall.netProfit / 1_000_000_000n),
          estimated_gas_cost_native: Number(waterfall.estimatedGasCost / 1_000_000_000n),
          error_message: errorMsg,
          run_type: 'EXECUTE',
          purpose: 'MANUAL',
        });
        return new Response(JSON.stringify({ 
          error: 'Token approval failed',
          details: errorMsg,
          wallet_address: walletAddress,
          network: network,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Step 6: Execute leg A swap
    console.log(`[execute-evm-arbitrage] Executing leg A swap...`);
    let txHashA: string;
    let gasUsedA = 0n;
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
      gasUsedA = receiptA?.gasUsed || 0n;
      console.log(`[execute-evm-arbitrage] Leg A confirmed in block ${receiptA?.blockNumber}, gas used: ${gasUsedA}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Leg A execution failed';
      console.error(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        estimated_profit_lamports: Number(waterfall.netProfit / 1_000_000_000n),
        estimated_gas_cost_native: Number(waterfall.estimatedGasCost / 1_000_000_000n),
        error_message: errorMsg,
      });

      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'OPS_REFILL',
        strategy_id: strategy.id,
        notional_in: inputWei,
        expected_gross_profit: waterfall.grossProfit.toString(),
        expected_net_profit: waterfall.netProfit.toString(),
        effective_gas_price: effectiveGasPrice.toString(),
        status: 'FAILED',
        error_message: `Leg A execution failed: ${errorMsg}`,
      });

      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 7: Get swap transaction for leg B
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
        estimated_profit_lamports: Number(waterfall.netProfit / 1_000_000_000n),
        estimated_gas_cost_native: Number(waterfall.estimatedGasCost / 1_000_000_000n),
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
      const legBApproval = await approveTokenIfNeeded(
        executionWallet,
        strategy.token_out_mint,
        PERMIT2_ADDRESS,
        quoteA.buyAmount
      );
      if (!legBApproval.success) {
        console.warn(`[execute-evm-arbitrage] Leg B approval warning: ${legBApproval.error}`);
        // Continue anyway since leg A is already executed - we need to try leg B
      }
    }

    // Step 8: Execute leg B swap
    console.log(`[execute-evm-arbitrage] Executing leg B swap...`);
    let txHashB: string;
    let gasUsedB = 0n;
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
      gasUsedB = receiptB?.gasUsed || 0n;
      console.log(`[execute-evm-arbitrage] Leg B confirmed in block ${receiptB?.blockNumber}, gas used: ${gasUsedB}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Leg B execution failed';
      console.error(`[execute-evm-arbitrage] ${errorMsg}`);
      
      await supabase.from('arbitrage_runs').insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'FAILED',
        tx_signature: txHashA,
        estimated_profit_lamports: Number(waterfall.netProfit / 1_000_000_000n),
        estimated_gas_cost_native: Number(waterfall.estimatedGasCost / 1_000_000_000n),
        error_message: `Leg B failed: ${errorMsg}`,
      });

      await logOpsArbitrageEvent(supabase, {
        network,
        mode: 'OPS_REFILL',
        strategy_id: strategy.id,
        notional_in: inputWei,
        expected_gross_profit: waterfall.grossProfit.toString(),
        expected_net_profit: waterfall.netProfit.toString(),
        gas_used: gasUsedA.toString(),
        effective_gas_price: effectiveGasPrice.toString(),
        tx_hash: txHashA,
        status: 'FAILED',
        error_message: `Leg B execution failed: ${errorMsg}`,
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

    // ============ CAPTURE POST-EXECUTION BALANCE SNAPSHOT ============
    let realizedProfit = waterfall.netProfit; // Default to expected if snapshot fails
    let gasSpent = 0n;
    const totalGasUsed = gasUsedA + gasUsedB;

    try {
      if (executionWallet.provider && preBalanceSnapshot) {
        const postBalanceSnapshot = await captureBalanceSnapshot(
          executionWallet.provider,
          walletAddress,
          strategy.token_in_mint
        );
        console.log(`[execute-evm-arbitrage] Post-execution snapshot: gas=${postBalanceSnapshot.gasTokenBalance}, profit=${postBalanceSnapshot.profitTokenBalance}`);

        const realized = calculateRealizedProfit(preBalanceSnapshot, postBalanceSnapshot);
        realizedProfit = realized.realizedProfit;
        gasSpent = realized.gasSpent;

        console.log(`[execute-evm-arbitrage] === REALIZED PROFIT ===`);
        console.log(`[execute-evm-arbitrage] Expected Net Profit: ${waterfall.netProfit} wei`);
        console.log(`[execute-evm-arbitrage] REALIZED Profit: ${realizedProfit} wei`);
        console.log(`[execute-evm-arbitrage] Gas Spent: ${gasSpent} wei`);
        console.log(`[execute-evm-arbitrage] Total Gas Used: ${totalGasUsed} units`);
        console.log(`[execute-evm-arbitrage] =======================`);
      }
    } catch (snapshotError) {
      console.warn(`[execute-evm-arbitrage] Failed to capture post-execution snapshot:`, snapshotError);
    }

    // Success - record the execution with REALIZED profit
    const finishedAt = new Date().toISOString();
    const { data: runData } = await supabase
      .from('arbitrage_runs')
      .insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: finishedAt,
        status: 'EXECUTED',
        tx_signature: `${txHashA},${txHashB}`,
        estimated_profit_lamports: Number(waterfall.netProfit / 1_000_000_000n),
        actual_profit_lamports: Number(realizedProfit / 1_000_000_000n),
        estimated_gas_cost_native: Number(gasSpent / 1_000_000_000n),
      })
      .select()
      .maybeSingle();

    console.log(`[execute-evm-arbitrage] Arbitrage executed successfully!`);

    // Log to ops_arbitrage_events with COMPLETE details
    const eventId = await logOpsArbitrageEvent(supabase, {
      network,
      mode: 'OPS_REFILL',
      strategy_id: strategy.id,
      run_id: runData?.id,
      notional_in: inputWei,
      expected_gross_profit: waterfall.grossProfit.toString(),
      expected_net_profit: waterfall.netProfit.toString(),
      realized_profit: realizedProfit.toString(),
      gas_used: totalGasUsed.toString(),
      effective_gas_price: effectiveGasPrice.toString(),
      tx_hash: `${txHashA},${txHashB}`,
      status: 'EXECUTED',
    });

    // ============ PNL DISCREPANCY EVALUATION ============
    const discrepancy = evaluatePnlDiscrepancy({
      expectedNetProfit: waterfall.netProfit,
      realizedProfit,
      estimatedGasCost: waterfall.estimatedGasCost,
      actualGasSpent: gasSpent,
    });

    console.log(`[execute-evm-arbitrage] PnL Discrepancy: delta=${discrepancy.pnlDelta}, ratio=${discrepancy.pnlRatio.toFixed(3)}, alert=${discrepancy.isAlert}`);

    let alertCreated = false;
    let executionLocked = false;

    if (discrepancy.isAlert && discrepancy.alertType) {
      alertCreated = true;
      console.warn(`[execute-evm-arbitrage] PNL ALERT: ${discrepancy.alertType} - ${discrepancy.reason}`);
      
      await logPnlAlert(supabase, {
        network,
        run_id: eventId || undefined,
        alert_type: discrepancy.alertType,
        severity: discrepancy.severity,
        expected_net_profit: waterfall.netProfit.toString(),
        realized_profit: realizedProfit.toString(),
        gas_spent: gasSpent.toString(),
        details_json: {
          pnl_delta: discrepancy.pnlDelta.toString(),
          pnl_ratio: discrepancy.pnlRatio,
          reason: discrepancy.reason,
          strategy_id: strategy.id,
          tx_hash_a: txHashA,
          tx_hash_b: txHashB,
          estimated_gas_cost: waterfall.estimatedGasCost.toString(),
          actual_gas_spent: gasSpent.toString(),
        },
      });

      // Check if we should auto-lock (only on mainnet with execution enabled)
      if (arbEnv === 'mainnet' && arbExecutionEnabled) {
        executionLocked = await checkAndAutoLock(supabase, network);
      }
    }

    // Trigger auto-refill if REALIZED profit exceeds threshold
    if (realizedProfit >= AUTO_REFILL_PROFIT_THRESHOLD_WEI) {
      console.log(`[execute-evm-arbitrage] Realized profit ${realizedProfit} >= threshold, triggering auto-refill...`);
      EdgeRuntime.waitUntil(autoRefillEvmFeePayers(network));
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'EVM OPS_REFILL arbitrage executed successfully',
      strategy_name: strategy.name,
      network,
      execution_mode: 'OPS_REFILL',
      arb_env: arbEnv,
      wallet_used: walletAddress,
      used_fee_payer: !!usedFeePayer,
      leg_a_tx: txHashA,
      leg_b_tx: txHashB,
      // Profit waterfall details
      gross_profit_wei: waterfall.grossProfit.toString(),
      estimated_gas_cost_wei: waterfall.estimatedGasCost.toString(),
      expected_net_profit_wei: waterfall.netProfit.toString(),
      // Realized values
      realized_profit_wei: realizedProfit.toString(),
      gas_spent_wei: gasSpent.toString(),
      total_gas_used: totalGasUsed.toString(),
      profit_bps: waterfall.profitBps,
      run_id: runData?.id,
      status: 'EXECUTED',
      auto_refill_triggered: realizedProfit >= AUTO_REFILL_PROFIT_THRESHOLD_WEI,
      // PnL discrepancy info
      pnl_discrepancy: {
        delta: discrepancy.pnlDelta.toString(),
        ratio: discrepancy.pnlRatio,
        alert_created: alertCreated,
        alert_type: discrepancy.alertType,
        severity: discrepancy.severity,
        execution_locked: executionLocked,
      },
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
