// Scan Polygon OPS Refill: USDC -> WETH -> USDC cycle
// Quotes both legs via 0x API and computes net profit waterfall

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getZeroXQuote } from "../_shared/zerox-client.ts";
import { POLYGON_TOKENS, OPS_REFILL_CONFIG, formatUSDC, formatWETH } from "../_shared/polygon-tokens.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment thresholds (can be overridden via secrets)
const MIN_NET_PROFIT_WEI = BigInt(Deno.env.get('MIN_NET_PROFIT_WEI') || '0');
const MIN_PROFIT_BPS = parseInt(Deno.env.get('MIN_PROFIT_BPS') || '5', 10);
const MAX_NOTIONAL_WEI = BigInt(Deno.env.get('MAX_NOTIONAL_WEI') || OPS_REFILL_CONFIG.MAX_NOTIONAL_USDC.toString());
const DEFAULT_SLIPPAGE_BPS = parseInt(Deno.env.get('SLIPPAGE_BPS') || '30', 10);

interface ScanResult {
  success: boolean;
  profitable: boolean;
  notionalIn: string;
  leg1Output: string;
  leg2Output: string;
  grossProfit: string;
  estimatedGasCost: string;
  slippageBuffer: string;
  netProfit: string;
  profitBps: number;
  meetsThreshold: boolean;
  eventId: string | null;
  error: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const scanStartTime = Date.now();
  console.log('[scan-polygon-ops-refill] Starting USDC->WETH->USDC scan...');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse request body for optional notional override
    let requestedNotional: bigint | null = null;
    try {
      const body = await req.json();
      if (body.notionalUSDC) {
        requestedNotional = BigInt(body.notionalUSDC);
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Determine notional: min(requested or default, MAX_NOTIONAL)
    const notionalIn = requestedNotional 
      ? (requestedNotional > MAX_NOTIONAL_WEI ? MAX_NOTIONAL_WEI : requestedNotional)
      : (OPS_REFILL_CONFIG.DEFAULT_NOTIONAL_USDC > MAX_NOTIONAL_WEI 
          ? MAX_NOTIONAL_WEI 
          : OPS_REFILL_CONFIG.DEFAULT_NOTIONAL_USDC);

    console.log(`[scan-polygon-ops-refill] Notional: ${formatUSDC(notionalIn)}`);
    console.log(`[scan-polygon-ops-refill] Tokens: USDC.e (${POLYGON_TOKENS.USDC_E.address}) -> WETH (${POLYGON_TOKENS.WETH.address})`);

    // ============ LEG 1: USDC.e -> WETH ============
    console.log('[scan-polygon-ops-refill] Fetching Leg 1 quote: USDC.e -> WETH');
    const leg1Quote = await getZeroXQuote({
      network: 'POLYGON',
      sellToken: POLYGON_TOKENS.USDC_E.address,
      buyToken: POLYGON_TOKENS.WETH.address,
      sellAmount: notionalIn.toString(),
    });

    if (!leg1Quote) {
      const errorResult = await recordScanEvent(supabase, {
        status: 'FAILED',
        notionalIn: notionalIn.toString(),
        errorMessage: 'Failed to fetch Leg 1 quote (USDC.e -> WETH)',
      });
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch Leg 1 quote',
        eventId: errorResult.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const leg1Output = BigInt(leg1Quote.buyAmount);
    const leg1Gas = BigInt(leg1Quote.gas || '300000');
    const leg1GasPrice = BigInt(leg1Quote.gasPrice || '50000000000'); // 50 gwei default
    
    console.log(`[scan-polygon-ops-refill] Leg 1 output: ${formatWETH(leg1Output)}`);

    // ============ LEG 2: WETH -> USDC.e ============
    console.log('[scan-polygon-ops-refill] Fetching Leg 2 quote: WETH -> USDC.e');
    const leg2Quote = await getZeroXQuote({
      network: 'POLYGON',
      sellToken: POLYGON_TOKENS.WETH.address,
      buyToken: POLYGON_TOKENS.USDC_E.address,
      sellAmount: leg1Output.toString(),
    });

    if (!leg2Quote) {
      const errorResult = await recordScanEvent(supabase, {
        status: 'FAILED',
        notionalIn: notionalIn.toString(),
        errorMessage: 'Failed to fetch Leg 2 quote (WETH -> USDC.e)',
      });
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch Leg 2 quote',
        eventId: errorResult.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const leg2Output = BigInt(leg2Quote.buyAmount);
    const leg2Gas = BigInt(leg2Quote.gas || '300000');
    const leg2GasPrice = BigInt(leg2Quote.gasPrice || '50000000000');

    console.log(`[scan-polygon-ops-refill] Leg 2 output: ${formatUSDC(leg2Output)}`);

    // ============ NET PROFIT WATERFALL ============
    const grossProfit = leg2Output - notionalIn;
    const avgGasPrice = (leg1GasPrice + leg2GasPrice) / 2n;
    const totalGas = leg1Gas + leg2Gas;
    const estimatedGasCostWei = totalGas * avgGasPrice;
    
    // Convert gas cost from POL (18 decimals) to USDC equivalent
    // For simplicity, assume 1 POL = $0.50 USD, so 1 USDC = 2 POL
    // Gas cost in USDC ≈ gasCostPOL / 2
    const gasCostPOL = estimatedGasCostWei;
    const gasCostUSDCEquivalent = gasCostPOL / 2n / 10n ** 12n; // Convert 18 decimals to 6 decimals and divide by 2
    
    // Slippage buffer (applied to input, in USDC terms)
    const slippageBuffer = (notionalIn * BigInt(DEFAULT_SLIPPAGE_BPS)) / 10000n;
    
    // Net profit after gas and slippage
    const netProfit = grossProfit - gasCostUSDCEquivalent - slippageBuffer;
    
    // Profit in basis points relative to input
    const profitBps = notionalIn > 0n 
      ? Number((netProfit * 10000n) / notionalIn)
      : 0;

    const meetsThreshold = netProfit > MIN_NET_PROFIT_WEI && profitBps >= MIN_PROFIT_BPS;
    const isProfitable = netProfit > 0n;

    console.log(`[scan-polygon-ops-refill] === PROFIT WATERFALL ===`);
    console.log(`[scan-polygon-ops-refill] Gross Profit: ${formatUSDC(grossProfit)}`);
    console.log(`[scan-polygon-ops-refill] Est. Gas Cost: ${formatUSDC(gasCostUSDCEquivalent)} (${Number(gasCostPOL) / 1e18} POL)`);
    console.log(`[scan-polygon-ops-refill] Slippage Buffer: ${formatUSDC(slippageBuffer)}`);
    console.log(`[scan-polygon-ops-refill] Net Profit: ${formatUSDC(netProfit)} (${profitBps} bps)`);
    console.log(`[scan-polygon-ops-refill] Meets Threshold: ${meetsThreshold}`);

    // ============ RECORD EVENT ============
    const eventResult = await recordScanEvent(supabase, {
      status: 'SIMULATED',
      notionalIn: notionalIn.toString(),
      expectedGrossProfit: grossProfit.toString(),
      expectedNetProfit: netProfit.toString(),
      leg1Output: leg1Output.toString(),
      leg2Output: leg2Output.toString(),
      estimatedGasCost: estimatedGasCostWei.toString(),
      slippageBuffer: slippageBuffer.toString(),
      profitBps,
      meetsThreshold,
    });

    const scanDuration = Date.now() - scanStartTime;
    console.log(`[scan-polygon-ops-refill] Scan complete in ${scanDuration}ms`);

    const result: ScanResult = {
      success: true,
      profitable: isProfitable,
      notionalIn: notionalIn.toString(),
      leg1Output: leg1Output.toString(),
      leg2Output: leg2Output.toString(),
      grossProfit: grossProfit.toString(),
      estimatedGasCost: estimatedGasCostWei.toString(),
      slippageBuffer: slippageBuffer.toString(),
      netProfit: netProfit.toString(),
      profitBps,
      meetsThreshold,
      eventId: eventResult.id,
      error: null,
    };

    return new Response(JSON.stringify({
      ...result,
      formatted: {
        notionalIn: formatUSDC(notionalIn),
        leg1Output: formatWETH(leg1Output),
        leg2Output: formatUSDC(leg2Output),
        grossProfit: formatUSDC(grossProfit),
        netProfit: formatUSDC(netProfit),
      },
      scanDurationMs: scanDuration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[scan-polygon-ops-refill] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Record failed event
    await recordScanEvent(supabase, {
      status: 'FAILED',
      notionalIn: '0',
      errorMessage,
    });

    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper to record scan event to ops_arbitrage_events
async function recordScanEvent(
  supabase: any,
  params: {
    status: string;
    notionalIn: string;
    expectedGrossProfit?: string;
    expectedNetProfit?: string;
    leg1Output?: string;
    leg2Output?: string;
    estimatedGasCost?: string;
    slippageBuffer?: string;
    profitBps?: number;
    meetsThreshold?: boolean;
    errorMessage?: string;
  }
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('ops_arbitrage_events')
    .insert({
      chain: 'EVM',
      network: 'POLYGON',
      mode: 'OPS_REFILL_SCAN',
      status: params.status,
      notional_in: params.notionalIn,
      expected_gross_profit: params.expectedGrossProfit || null,
      expected_net_profit: params.expectedNetProfit || null,
      error_message: params.errorMessage || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[scan-polygon-ops-refill] Failed to record event:', error);
    return { id: 'error' };
  }

  return { id: data.id };
}
