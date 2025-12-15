// Execute Polygon OPS Refill: USDC -> WETH -> USDC cycle
// Requires ADMIN + mainnet mode + execution enabled + not locked

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ethers } from "https://esm.sh/ethers@6.13.2";
import { getEvmOpsWallet } from "../_shared/evm-ops-wallet.ts";
import { POLYGON_TOKENS, OPS_REFILL_CONFIG, formatUSDC, formatWETH, formatPOL } from "../_shared/polygon-tokens.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment gates
const ARB_ENV = Deno.env.get('ARB_ENV') || 'testnet';
const ARB_EXECUTION_ENABLED = Deno.env.get('ARB_EXECUTION_ENABLED') === 'true';
const MIN_NET_PROFIT_WEI = BigInt(Deno.env.get('MIN_NET_PROFIT_WEI') || '100000'); // 0.1 USDC
const MIN_PROFIT_BPS = parseInt(Deno.env.get('MIN_PROFIT_BPS') || '5', 10);
const MAX_NOTIONAL_WEI = BigInt(Deno.env.get('MAX_NOTIONAL_WEI') || OPS_REFILL_CONFIG.MAX_NOTIONAL_USDC.toString());
const DEFAULT_SLIPPAGE_BPS = parseInt(Deno.env.get('SLIPPAGE_BPS') || '30', 10);

// PnL Alert thresholds
const PNL_ALERT_MIN_RATIO = parseFloat(Deno.env.get('PNL_ALERT_MIN_RATIO') || '0.70');
const PNL_ALERT_MAX_GAS_MULTIPLIER = parseFloat(Deno.env.get('PNL_ALERT_MAX_GAS_MULTIPLIER') || '1.30');
const PNL_FAIL_MAX_CONSECUTIVE = parseInt(Deno.env.get('PNL_FAIL_MAX_CONSECUTIVE') || '2', 10);
const PNL_FAIL_WINDOW_MINUTES = parseInt(Deno.env.get('PNL_FAIL_WINDOW_MINUTES') || '30', 10);

// 0x API configuration
const ZEROX_API_BASE_URL = "https://api.0x.org";
const ZEROX_API_KEY = Deno.env.get("ZEROX_API_KEY");

// ERC20 ABI for approvals and balance checks
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[execute-polygon-ops-refill] Starting execution...');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ============ GATE 1: Verify ADMIN role ============
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return errorResponse('Invalid authorization', 401);
    }

    // Check admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin');

    if (!roles || roles.length === 0) {
      return errorResponse('Admin role required for execution', 403);
    }

    console.log(`[execute-polygon-ops-refill] Admin verified: ${user.email}`);

    // ============ GATE 2: Check environment gates ============
    if (ARB_ENV !== 'mainnet') {
      return errorResponse(`ARB_ENV must be 'mainnet', got: ${ARB_ENV}`, 400);
    }

    if (!ARB_EXECUTION_ENABLED) {
      return errorResponse('ARB_EXECUTION_ENABLED is false', 400);
    }

    // ============ GATE 3: Check execution lock ============
    const { data: settings } = await supabase
      .from('system_settings')
      .select('arb_execution_locked, arb_execution_locked_reason, is_mainnet_mode')
      .single();

    if (settings?.arb_execution_locked) {
      return errorResponse(`Execution locked: ${settings.arb_execution_locked_reason || 'Unknown reason'}`, 423);
    }

    if (!settings?.is_mainnet_mode) {
      return errorResponse('System not in mainnet mode', 400);
    }

    // ============ GATE 4: Validate 0x API key ============
    if (!ZEROX_API_KEY) {
      return errorResponse('ZEROX_API_KEY not configured', 500);
    }

    // ============ PARSE REQUEST ============
    let notionalIn = OPS_REFILL_CONFIG.DEFAULT_NOTIONAL_USDC;
    try {
      const body = await req.json();
      if (body.notionalUSDC) {
        const requested = BigInt(body.notionalUSDC);
        notionalIn = requested > MAX_NOTIONAL_WEI ? MAX_NOTIONAL_WEI : requested;
      }
    } catch {
      // Use default
    }

    console.log(`[execute-polygon-ops-refill] Notional: ${formatUSDC(notionalIn)}`);

    // ============ GET OPS WALLET ============
    const opsWallet = getEvmOpsWallet('POLYGON');
    const provider = opsWallet.provider;
    const wallet = opsWallet.wallet;
    const opsAddress = opsWallet.address;

    console.log(`[execute-polygon-ops-refill] OPS Wallet: ${opsAddress}`);

    // ============ CAPTURE PRE-EXECUTION BALANCES ============
    const usdcContract = new ethers.Contract(POLYGON_TOKENS.USDC_E.address, ERC20_ABI, provider);
    const wethContract = new ethers.Contract(POLYGON_TOKENS.WETH.address, ERC20_ABI, provider);

    const preUSDC = await usdcContract.balanceOf(opsAddress);
    const preWETH = await wethContract.balanceOf(opsAddress);
    const prePOL = await provider.getBalance(opsAddress);

    console.log(`[execute-polygon-ops-refill] Pre-balances: USDC=${formatUSDC(preUSDC)}, WETH=${formatWETH(preWETH)}, POL=${formatPOL(prePOL)}`);

    // Verify sufficient USDC balance
    if (BigInt(preUSDC.toString()) < notionalIn) {
      return errorResponse(`Insufficient USDC balance: have ${formatUSDC(BigInt(preUSDC.toString()))}, need ${formatUSDC(notionalIn)}`, 400);
    }

    // ============ GET FRESH QUOTES ============
    console.log('[execute-polygon-ops-refill] Fetching fresh Leg 1 quote...');
    const leg1Quote = await getExecutableQuote({
      sellToken: POLYGON_TOKENS.USDC_E.address,
      buyToken: POLYGON_TOKENS.WETH.address,
      sellAmount: notionalIn.toString(),
      takerAddress: opsAddress,
    });

    if (!leg1Quote) {
      await recordEvent(supabase, 'FAILED', notionalIn.toString(), null, null, null, null, 'Failed to get Leg 1 quote');
      return errorResponse('Failed to get Leg 1 quote', 500);
    }

    const leg1Output = BigInt(leg1Quote.buyAmount);
    console.log(`[execute-polygon-ops-refill] Leg 1 expected output: ${formatWETH(leg1Output)}`);

    console.log('[execute-polygon-ops-refill] Fetching fresh Leg 2 quote...');
    const leg2Quote = await getExecutableQuote({
      sellToken: POLYGON_TOKENS.WETH.address,
      buyToken: POLYGON_TOKENS.USDC_E.address,
      sellAmount: leg1Output.toString(),
      takerAddress: opsAddress,
    });

    if (!leg2Quote) {
      await recordEvent(supabase, 'FAILED', notionalIn.toString(), null, null, null, null, 'Failed to get Leg 2 quote');
      return errorResponse('Failed to get Leg 2 quote', 500);
    }

    const leg2Output = BigInt(leg2Quote.buyAmount);
    console.log(`[execute-polygon-ops-refill] Leg 2 expected output: ${formatUSDC(leg2Output)}`);

    // ============ COMPUTE NET PROFIT WATERFALL ============
    const grossProfit = leg2Output - notionalIn;
    const leg1Gas = BigInt(leg1Quote.gas || '300000');
    const leg2Gas = BigInt(leg2Quote.gas || '300000');
    const gasPrice = BigInt(leg1Quote.gasPrice || '50000000000');
    const estimatedGasCostWei = (leg1Gas + leg2Gas) * gasPrice;
    const gasCostUSDCEquivalent = estimatedGasCostWei / 2n / 10n ** 12n;
    const slippageBuffer = (notionalIn * BigInt(DEFAULT_SLIPPAGE_BPS)) / 10000n;
    const expectedNetProfit = grossProfit - gasCostUSDCEquivalent - slippageBuffer;
    const profitBps = notionalIn > 0n ? Number((expectedNetProfit * 10000n) / notionalIn) : 0;

    console.log(`[execute-polygon-ops-refill] Expected net profit: ${formatUSDC(expectedNetProfit)} (${profitBps} bps)`);

    // ============ GATE 5: Profit threshold check ============
    if (expectedNetProfit < MIN_NET_PROFIT_WEI) {
      await recordEvent(supabase, 'REJECTED', notionalIn.toString(), grossProfit.toString(), expectedNetProfit.toString(), null, null, 
        `Net profit ${formatUSDC(expectedNetProfit)} below threshold ${formatUSDC(MIN_NET_PROFIT_WEI)}`);
      return errorResponse(`Net profit ${formatUSDC(expectedNetProfit)} below threshold`, 400);
    }

    if (profitBps < MIN_PROFIT_BPS) {
      await recordEvent(supabase, 'REJECTED', notionalIn.toString(), grossProfit.toString(), expectedNetProfit.toString(), null, null,
        `Profit ${profitBps} bps below threshold ${MIN_PROFIT_BPS} bps`);
      return errorResponse(`Profit ${profitBps} bps below threshold`, 400);
    }

    // ============ EXECUTE LEG 1: USDC -> WETH ============
    console.log('[execute-polygon-ops-refill] Approving USDC spend...');
    await approveTokenIfNeeded(wallet, POLYGON_TOKENS.USDC_E.address, leg1Quote.allowanceTarget, notionalIn.toString());

    console.log('[execute-polygon-ops-refill] Executing Leg 1 swap...');
    const leg1Tx = await wallet.sendTransaction({
      to: leg1Quote.to,
      data: leg1Quote.data,
      value: BigInt(leg1Quote.value || '0'),
      gasLimit: leg1Gas * 12n / 10n, // 20% buffer
    });

    console.log(`[execute-polygon-ops-refill] Leg 1 tx submitted: ${leg1Tx.hash}`);
    const leg1Receipt = await leg1Tx.wait();
    console.log(`[execute-polygon-ops-refill] Leg 1 confirmed in block ${leg1Receipt?.blockNumber}`);

    // ============ EXECUTE LEG 2: WETH -> USDC ============
    // Get actual WETH received
    const midWETH = await wethContract.balanceOf(opsAddress);
    const actualWethReceived = BigInt(midWETH.toString()) - BigInt(preWETH.toString());
    console.log(`[execute-polygon-ops-refill] Actual WETH received: ${formatWETH(actualWethReceived)}`);

    console.log('[execute-polygon-ops-refill] Approving WETH spend...');
    await approveTokenIfNeeded(wallet, POLYGON_TOKENS.WETH.address, leg2Quote.allowanceTarget, actualWethReceived.toString());

    // Re-quote leg 2 with actual WETH amount if significantly different
    let finalLeg2Quote = leg2Quote;
    const wethDiff = actualWethReceived > leg1Output 
      ? actualWethReceived - leg1Output 
      : leg1Output - actualWethReceived;
    const wethDiffPct = Number(wethDiff * 100n / leg1Output);
    
    if (wethDiffPct > 1) {
      console.log(`[execute-polygon-ops-refill] WETH diff ${wethDiffPct}%, re-quoting leg 2...`);
      const newLeg2Quote = await getExecutableQuote({
        sellToken: POLYGON_TOKENS.WETH.address,
        buyToken: POLYGON_TOKENS.USDC_E.address,
        sellAmount: actualWethReceived.toString(),
        takerAddress: opsAddress,
      });
      if (newLeg2Quote) {
        finalLeg2Quote = newLeg2Quote;
      }
    }

    console.log('[execute-polygon-ops-refill] Executing Leg 2 swap...');
    const leg2Tx = await wallet.sendTransaction({
      to: finalLeg2Quote.to,
      data: finalLeg2Quote.data,
      value: BigInt(finalLeg2Quote.value || '0'),
      gasLimit: leg2Gas * 12n / 10n,
    });

    console.log(`[execute-polygon-ops-refill] Leg 2 tx submitted: ${leg2Tx.hash}`);
    const leg2Receipt = await leg2Tx.wait();
    console.log(`[execute-polygon-ops-refill] Leg 2 confirmed in block ${leg2Receipt?.blockNumber}`);

    // ============ CAPTURE POST-EXECUTION BALANCES ============
    const postUSDC = await usdcContract.balanceOf(opsAddress);
    const postWETH = await wethContract.balanceOf(opsAddress);
    const postPOL = await provider.getBalance(opsAddress);

    const realizedProfit = BigInt(postUSDC.toString()) - BigInt(preUSDC.toString());
    const gasSpent = BigInt(prePOL.toString()) - BigInt(postPOL.toString());

    console.log(`[execute-polygon-ops-refill] Post-balances: USDC=${formatUSDC(BigInt(postUSDC.toString()))}`);
    console.log(`[execute-polygon-ops-refill] Realized profit: ${formatUSDC(realizedProfit)}`);
    console.log(`[execute-polygon-ops-refill] Gas spent: ${formatPOL(gasSpent)}`);

    // ============ RECORD SUCCESS EVENT ============
    const txHashes = `${leg1Tx.hash},${leg2Tx.hash}`;
    const eventId = await recordEvent(
      supabase,
      'EXECUTED',
      notionalIn.toString(),
      grossProfit.toString(),
      expectedNetProfit.toString(),
      realizedProfit.toString(),
      txHashes,
      null,
      gasSpent.toString()
    );

    // ============ PNL DISCREPANCY CHECK ============
    await checkPnLDiscrepancy(supabase, {
      expectedNetProfit,
      realizedProfit,
      estimatedGasCost: estimatedGasCostWei,
      actualGasSpent: gasSpent,
      eventId,
    });

    return new Response(JSON.stringify({
      success: true,
      eventId,
      txHashes: [leg1Tx.hash, leg2Tx.hash],
      notionalIn: notionalIn.toString(),
      expectedNetProfit: expectedNetProfit.toString(),
      realizedProfit: realizedProfit.toString(),
      gasSpent: gasSpent.toString(),
      formatted: {
        notionalIn: formatUSDC(notionalIn),
        expectedNetProfit: formatUSDC(expectedNetProfit),
        realizedProfit: formatUSDC(realizedProfit),
        gasSpent: formatPOL(gasSpent),
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[execute-polygon-ops-refill] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    await recordEvent(supabase, 'FAILED', '0', null, null, null, null, errorMessage);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper: Error response
function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Helper: Get executable quote from 0x API v2
async function getExecutableQuote(params: {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress: string;
}): Promise<any | null> {
  const url = new URL(`${ZEROX_API_BASE_URL}/swap/allowance-holder/quote`);
  url.searchParams.set("sellToken", params.sellToken);
  url.searchParams.set("buyToken", params.buyToken);
  url.searchParams.set("sellAmount", params.sellAmount);
  url.searchParams.set("chainId", "137");
  url.searchParams.set("taker", params.takerAddress);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        "0x-api-key": ZEROX_API_KEY!,
        "0x-version": "v2",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[execute-polygon-ops-refill] 0x API error: ${response.status} - ${errorText.substring(0, 300)}`);
      return null;
    }

    const data = await response.json();
    return {
      buyAmount: data.buyAmount,
      to: data.transaction?.to || data.to,
      data: data.transaction?.data || data.data,
      value: data.transaction?.value || data.value || '0',
      gas: data.transaction?.gas || data.gas || '300000',
      gasPrice: data.transaction?.gasPrice || data.gasPrice,
      allowanceTarget: data.issues?.allowance?.spender || data.allowanceTarget,
    };
  } catch (error) {
    console.error('[execute-polygon-ops-refill] Quote fetch error:', error);
    return null;
  }
}

// Helper: Approve token spending
async function approveTokenIfNeeded(
  wallet: ethers.Wallet,
  tokenAddress: string,
  spender: string,
  amount: string
): Promise<void> {
  if (!spender) return;
  
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const currentAllowance = await token.allowance(wallet.address, spender);
  
  if (BigInt(currentAllowance.toString()) < BigInt(amount)) {
    console.log(`[execute-polygon-ops-refill] Approving ${tokenAddress} for ${spender}...`);
    const tx = await token.approve(spender, ethers.MaxUint256);
    await tx.wait();
    console.log(`[execute-polygon-ops-refill] Approval confirmed: ${tx.hash}`);
  }
}

// Helper: Record event
async function recordEvent(
  supabase: any,
  status: string,
  notionalIn: string,
  grossProfit: string | null,
  netProfit: string | null,
  realizedProfit: string | null,
  txHash: string | null,
  errorMessage: string | null,
  gasUsed?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('ops_arbitrage_events')
    .insert({
      chain: 'EVM',
      network: 'POLYGON',
      mode: 'OPS_REFILL',
      status,
      notional_in: notionalIn,
      expected_gross_profit: grossProfit,
      expected_net_profit: netProfit,
      realized_profit: realizedProfit,
      tx_hash: txHash,
      error_message: errorMessage,
      gas_used: gasUsed || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[execute-polygon-ops-refill] Failed to record event:', error);
    return 'error';
  }
  return data.id;
}

// Helper: Check PnL discrepancy and potentially lock execution
async function checkPnLDiscrepancy(
  supabase: any,
  params: {
    expectedNetProfit: bigint;
    realizedProfit: bigint;
    estimatedGasCost: bigint;
    actualGasSpent: bigint;
    eventId: string;
  }
): Promise<void> {
  const { expectedNetProfit, realizedProfit, estimatedGasCost, actualGasSpent, eventId } = params;
  
  const safeExpected = expectedNetProfit > 0n ? expectedNetProfit : 1n;
  const pnlRatio = Number(realizedProfit) / Number(safeExpected);
  const gasRatio = Number(actualGasSpent) / Number(estimatedGasCost > 0n ? estimatedGasCost : 1n);
  
  let alertType: string | null = null;
  let severity: 'info' | 'warning' | 'critical' = 'info';
  let reason: string | null = null;

  // Check for negative realized profit
  if (realizedProfit < 0n) {
    alertType = 'NEGATIVE_REALIZED_PROFIT';
    severity = 'critical';
    reason = `Realized profit is negative: ${formatUSDC(realizedProfit)}`;
  }
  // Check for significant PnL shortfall
  else if (pnlRatio < PNL_ALERT_MIN_RATIO) {
    alertType = 'PNL_RATIO_LOW';
    severity = pnlRatio < 0.5 ? 'critical' : 'warning';
    reason = `PnL ratio ${(pnlRatio * 100).toFixed(1)}% below threshold ${PNL_ALERT_MIN_RATIO * 100}%`;
  }
  // Check for gas cost overrun
  else if (gasRatio > PNL_ALERT_MAX_GAS_MULTIPLIER) {
    alertType = 'GAS_COST_OVERRUN';
    severity = gasRatio > 2.0 ? 'critical' : 'warning';
    reason = `Gas cost ${(gasRatio * 100).toFixed(0)}% of estimate (threshold ${PNL_ALERT_MAX_GAS_MULTIPLIER * 100}%)`;
  }

  if (alertType) {
    console.warn(`[execute-polygon-ops-refill] PnL Alert: ${alertType} - ${reason}`);
    
    // Record alert
    await supabase.from('ops_arbitrage_alerts').insert({
      chain: 'EVM',
      network: 'POLYGON',
      run_id: eventId,
      alert_type: alertType,
      severity,
      expected_net_profit: expectedNetProfit.toString(),
      realized_profit: realizedProfit.toString(),
      gas_spent: actualGasSpent.toString(),
      details_json: { pnlRatio, gasRatio, reason },
    });

    // Check for consecutive critical/warning alerts to auto-lock
    if (severity === 'critical' || severity === 'warning') {
      const windowStart = new Date(Date.now() - PNL_FAIL_WINDOW_MINUTES * 60 * 1000).toISOString();
      
      const { data: recentAlerts } = await supabase
        .from('ops_arbitrage_alerts')
        .select('id')
        .in('severity', ['critical', 'warning'])
        .gte('created_at', windowStart)
        .is('acknowledged_at', null);

      if (recentAlerts && recentAlerts.length >= PNL_FAIL_MAX_CONSECUTIVE) {
        console.error(`[execute-polygon-ops-refill] AUTO-LOCKING: ${recentAlerts.length} alerts in ${PNL_FAIL_WINDOW_MINUTES} minutes`);
        
        const { data: settings } = await supabase
          .from('system_settings')
          .select('id')
          .single();

        if (settings) {
          await supabase
            .from('system_settings')
            .update({
              arb_execution_locked: true,
              arb_execution_locked_at: new Date().toISOString(),
              arb_execution_locked_reason: `Auto-locked: ${recentAlerts.length} PnL alerts in ${PNL_FAIL_WINDOW_MINUTES} minutes`,
            })
            .eq('id', settings.id);
        }
      }
    }
  }
}
