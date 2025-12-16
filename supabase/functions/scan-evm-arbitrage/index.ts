import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { 
  getZeroXQuoteWithDetails, 
  isValidEvmAddress, 
  calculateArbitrageProfit, 
  isSupportedZeroXNetwork, 
  isTestnet,
  validatePolygonTokenAddress,
  getPolygonTokenDecimals,
  formatAmountWithDecimals,
  MIN_DUST_THRESHOLD,
  POLYGON_CANONICAL_TOKENS,
} from "../_shared/zerox-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supported EVM DEXs (via 0x aggregator)
const SUPPORTED_EVM_DEXS = [
  'Uniswap V2',
  'Uniswap V3',
  'SushiSwap',
  'Aave V3',
  'QuickSwap',
  'PancakeSwap',
  '0x',
  'Curve',
  'Balancer',
];

// Testnets don't have 0x API support, so we use mock prices
const TESTNET_NETWORKS = ['SEPOLIA', 'POLYGON_AMOY', 'ARBITRUM_SEPOLIA', 'BSC_TESTNET'];

/**
 * Generate mock quote for testnet strategies (0x API doesn't support testnets)
 * Now configured to simulate PROFITABLE opportunities for testing flash loan execution
 */
function getMockQuote(sellAmount: string, isLegA: boolean): { buyAmount: string; sources: string[] } {
  const input = BigInt(sellAmount);
  
  if (isLegA) {
    // Leg A: Simulate getting MORE tokens (favorable rate) - gain 1-2%
    const gainBps = 100 + Math.floor(Math.random() * 100); // 100-200 bps gain
    const output = input + (input * BigInt(gainBps) / BigInt(10000));
    return {
      buyAmount: output.toString(),
      sources: ['Mock DEX A (testnet - profitable sim)'],
    };
  } else {
    // Leg B: Simulate slight loss but still net profitable - lose 0.1-0.3%
    const spreadBps = 10 + Math.floor(Math.random() * 20); // 10-30 bps loss
    const output = input - (input * BigInt(spreadBps) / BigInt(10000));
    return {
      buyAmount: output.toString(),
      sources: ['Mock DEX B (testnet - profitable sim)'],
    };
  }
}

/**
 * Log event to ops_arbitrage_events table
 */
async function logOpsArbitrageEvent(
  supabase: any,
  data: {
    chain: string;
    network: string;
    mode: string;
    status: string;
    strategy_id?: string;
    notional_in?: string;
    expected_gross_profit?: string;
    expected_net_profit?: string;
    realized_profit?: string;
    gas_used?: string;
    effective_gas_price?: string;
    tx_hash?: string;
    error_message?: string;
  }
) {
  try {
    const { error } = await supabase
      .from('ops_arbitrage_events')
      .insert({
        chain: data.chain,
        network: data.network,
        mode: data.mode,
        status: data.status,
        strategy_id: data.strategy_id,
        notional_in: data.notional_in,
        expected_gross_profit: data.expected_gross_profit,
        expected_net_profit: data.expected_net_profit,
        realized_profit: data.realized_profit,
        gas_used: data.gas_used,
        effective_gas_price: data.effective_gas_price,
        tx_hash: data.tx_hash,
        error_message: data.error_message,
      });
    
    if (error) {
      console.error('[scan-evm-arbitrage] Failed to log ops event:', error);
    }
  } catch (e) {
    console.error('[scan-evm-arbitrage] Exception logging ops event:', e);
  }
}

/**
 * Validate token addresses and decimals for Polygon
 */
function validateTokenConfig(strategy: any): { valid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (strategy.evm_network?.toUpperCase() !== 'POLYGON') {
    return { valid: true, warnings, errors }; // Only validate Polygon tokens
  }

  // Check token_in (typically USDC)
  const tokenInWarning = validatePolygonTokenAddress(strategy.token_in_mint, 'USDC');
  if (tokenInWarning) {
    warnings.push(`token_in: ${tokenInWarning}`);
  }

  // Check token_out (typically WMATIC)
  const tokenOutWarning = validatePolygonTokenAddress(strategy.token_out_mint, 'WMATIC');
  if (tokenOutWarning) {
    warnings.push(`token_out: ${tokenOutWarning}`);
  }

  // Verify canonical addresses
  const tokenInLower = strategy.token_in_mint.toLowerCase();
  const tokenOutLower = strategy.token_out_mint.toLowerCase();

  // Check if using non-canonical USDC
  if (tokenInLower === "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359") {
    warnings.push("Using Native USDC (0x3c499...) instead of USDC.e (0x2791...). This may have different liquidity.");
  }

  // Verify WMATIC address
  if (tokenOutLower !== POLYGON_CANONICAL_TOKENS.WMATIC.address.toLowerCase() &&
      (strategy.dex_a?.includes('WMATIC') || strategy.dex_b?.includes('WMATIC') || 
       strategy.name?.includes('WMATIC') || strategy.name?.includes('MATIC'))) {
    errors.push(`Strategy appears to use WMATIC but token_out (${strategy.token_out_mint}) doesn't match canonical address (${POLYGON_CANONICAL_TOKENS.WMATIC.address})`);
  }

  return { valid: errors.length === 0, warnings, errors };
}

/**
 * Get decimals for a token, with fallback
 */
function getTokenDecimals(address: string, network: string): number {
  if (network.toUpperCase() === 'POLYGON') {
    const decimals = getPolygonTokenDecimals(address);
    if (decimals !== null) return decimals;
  }
  // Default assumptions
  const lower = address.toLowerCase();
  // Common stablecoins have 6 decimals
  if (lower.includes('usdc') || lower.includes('usdt')) return 6;
  // Most ERC20 tokens have 18 decimals
  return 18;
}

/**
 * Simulate a single strategy with actual flash loan amount
 * Returns result object for aggregation
 */
async function simulateStrategy(
  strategy: any, 
  supabase: any
): Promise<any> {
  const startedAt = new Date().toISOString();
  console.log(`[scan-evm-arbitrage] ========================================`);
  console.log(`[scan-evm-arbitrage] Simulating strategy: ${strategy.name}`);
  console.log(`[scan-evm-arbitrage] Network: ${strategy.evm_network}`);
  console.log(`[scan-evm-arbitrage] Token In: ${strategy.token_in_mint}`);
  console.log(`[scan-evm-arbitrage] Token Out: ${strategy.token_out_mint}`);
  console.log(`[scan-evm-arbitrage] DEX A: ${strategy.dex_a}, DEX B: ${strategy.dex_b}`);

  // Validate inputs
  const validationErrors: string[] = [];
  if (!isValidEvmAddress(strategy.token_in_mint)) {
    validationErrors.push(`Invalid token_in address: ${strategy.token_in_mint}`);
  }
  if (!isValidEvmAddress(strategy.token_out_mint)) {
    validationErrors.push(`Invalid token_out address: ${strategy.token_out_mint}`);
  }
  if (!strategy.evm_network) {
    validationErrors.push('EVM network not specified');
  }
  if (strategy.evm_network && !isSupportedZeroXNetwork(strategy.evm_network)) {
    validationErrors.push(`Unsupported EVM network: ${strategy.evm_network}`);
  }

  // Validate token config for Polygon
  const tokenValidation = validateTokenConfig(strategy);
  if (!tokenValidation.valid) {
    validationErrors.push(...tokenValidation.errors);
  }
  if (tokenValidation.warnings.length > 0) {
    console.warn(`[scan-evm-arbitrage] Token warnings: ${tokenValidation.warnings.join('; ')}`);
  }

  if (validationErrors.length > 0) {
    console.error(`[scan-evm-arbitrage] Validation errors:`, validationErrors);
    
    const { data: runData } = await supabase
      .from('arbitrage_runs')
      .insert({
        strategy_id: strategy.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'SIMULATED',
        estimated_profit_lamports: 0,
        error_message: `Validation failed: ${validationErrors.join('; ')}`,
      })
      .select()
      .single();

    await logOpsArbitrageEvent(supabase, {
      chain: 'EVM',
      network: strategy.evm_network || 'UNKNOWN',
      mode: 'SCAN',
      status: 'VALIDATION_FAILED',
      strategy_id: strategy.id,
      error_message: validationErrors.join('; '),
    });

    return {
      strategy_id: strategy.id,
      strategy_name: strategy.name,
      chain_type: 'EVM',
      evm_network: strategy.evm_network,
      dex_a: strategy.dex_a,
      dex_b: strategy.dex_b,
      estimated_profit_wei: '0',
      meets_min_threshold: false,
      run_id: runData?.id,
      error: validationErrors.join('; '),
    };
  }

  // Get token decimals
  const tokenInDecimals = getTokenDecimals(strategy.token_in_mint, strategy.evm_network);
  const tokenOutDecimals = getTokenDecimals(strategy.token_out_mint, strategy.evm_network);
  console.log(`[scan-evm-arbitrage] Token decimals - In: ${tokenInDecimals}, Out: ${tokenOutDecimals}`);

  // Use actual flash loan amount from strategy, or default to 25,000 USDC (6 decimals)
  let inputWei: string;
  if (strategy.flash_loan_amount_native && strategy.flash_loan_amount_native > 0) {
    inputWei = BigInt(strategy.flash_loan_amount_native).toString();
  } else {
    // Default: 25,000 USDC = 25000 * 10^6 = 25,000,000,000
    inputWei = '25000000000';
  }
  
  console.log(`[scan-evm-arbitrage] Input amount: ${inputWei} (${formatAmountWithDecimals(inputWei, tokenInDecimals)} human units)`);
  
  let estimatedProfitWei = BigInt(0);
  let quoteError: string | null = null;
  let usedSources: string[] = [];
  let isMockPrice = false;
  let priceSource = '0x Aggregator';
  let estimatedGasCost = BigInt(0);
  let leg1Details: any = null;
  let leg2Details: any = null;

  // Check if this is a testnet - 0x API doesn't support testnets
  const isTestnetNetwork = TESTNET_NETWORKS.includes(strategy.evm_network?.toUpperCase() || '');

  if (isTestnetNetwork) {
    // Use mock prices for testnets
    console.log(`[scan-evm-arbitrage] Using mock prices for testnet: ${strategy.evm_network}`);
    isMockPrice = true;
    priceSource = 'Mock Prices (testnet - 0x API not available)';

    const mockQuoteA = getMockQuote(inputWei, true);
    const mockQuoteB = getMockQuote(mockQuoteA.buyAmount, false);
    
    usedSources = mockQuoteA.sources;
    estimatedProfitWei = calculateArbitrageProfit(inputWei, mockQuoteB.buyAmount);
    
    console.log(`[scan-evm-arbitrage] Mock Leg A output: ${mockQuoteA.buyAmount}`);
    console.log(`[scan-evm-arbitrage] Mock Leg B output: ${mockQuoteB.buyAmount}`);
    console.log(`[scan-evm-arbitrage] Mock round-trip profit: ${estimatedProfitWei} wei`);
  } else {
    // Use real 0x API for mainnets
    // Step 1: Get quote for token_in -> token_out (leg A)
    console.log(`[scan-evm-arbitrage] Fetching Leg 1 quote: ${strategy.token_in_mint} -> ${strategy.token_out_mint}`);
    
    const quoteAResult = await getZeroXQuoteWithDetails({
      network: strategy.evm_network,
      sellToken: strategy.token_in_mint,
      buyToken: strategy.token_out_mint,
      sellAmount: inputWei,
    });

    leg1Details = {
      sellToken: strategy.token_in_mint,
      buyToken: strategy.token_out_mint,
      sellAmount: inputWei,
      result: quoteAResult,
    };

    if (quoteAResult.quote) {
      const leg1Output = quoteAResult.quote.buyAmount;
      console.log(`[scan-evm-arbitrage] Leg 1 output: ${leg1Output} (${formatAmountWithDecimals(leg1Output, tokenOutDecimals)} human units)`);
      usedSources = quoteAResult.quote.sources;
      
      // Estimate gas cost from quote if available
      if (quoteAResult.quote.gas) {
        estimatedGasCost = BigInt(quoteAResult.quote.gas) * BigInt(quoteAResult.quote.gasPrice || '50000000000');
      }

      // CRITICAL: Validate leg 2 sellAmount (leg1 output)
      const leg2SellAmount = BigInt(leg1Output);
      
      if (leg2SellAmount <= BigInt(0)) {
        quoteError = `Leg 1 returned zero output - cannot proceed with leg 2. Leg1 sellAmount=${inputWei}, buyAmount=${leg1Output}`;
        console.error(`[scan-evm-arbitrage] ${quoteError}`);
        
        await logOpsArbitrageEvent(supabase, {
          chain: 'EVM',
          network: strategy.evm_network,
          mode: 'SCAN',
          status: 'LEG1_ZERO_OUTPUT',
          strategy_id: strategy.id,
          notional_in: inputWei,
          error_message: quoteError,
        });
      } else if (leg2SellAmount < MIN_DUST_THRESHOLD) {
        quoteError = `Leg 1 output (${leg1Output}) below dust threshold (${MIN_DUST_THRESHOLD}). Aborting leg 2.`;
        console.error(`[scan-evm-arbitrage] ${quoteError}`);
        
        await logOpsArbitrageEvent(supabase, {
          chain: 'EVM',
          network: strategy.evm_network,
          mode: 'SCAN',
          status: 'LEG1_DUST_OUTPUT',
          strategy_id: strategy.id,
          notional_in: inputWei,
          error_message: quoteError,
        });
      } else {
        // Step 2: Get quote for token_out -> token_in (leg B - round trip)
        console.log(`[scan-evm-arbitrage] Fetching Leg 2 quote: ${strategy.token_out_mint} -> ${strategy.token_in_mint}`);
        console.log(`[scan-evm-arbitrage] Leg 2 sellAmount: ${leg1Output} (from leg 1 buyAmount, ${tokenOutDecimals} decimals)`);
        
        const quoteBResult = await getZeroXQuoteWithDetails({
          network: strategy.evm_network,
          sellToken: strategy.token_out_mint,
          buyToken: strategy.token_in_mint,
          sellAmount: leg1Output, // Use leg1 output as base units
        });

        leg2Details = {
          sellToken: strategy.token_out_mint,
          buyToken: strategy.token_in_mint,
          sellAmount: leg1Output,
          result: quoteBResult,
        };

        if (quoteBResult.quote) {
          console.log(`[scan-evm-arbitrage] Leg 2 output: ${quoteBResult.quote.buyAmount} (${formatAmountWithDecimals(quoteBResult.quote.buyAmount, tokenInDecimals)} human units)`);
          
          // Add gas cost from leg B
          if (quoteBResult.quote.gas) {
            estimatedGasCost += BigInt(quoteBResult.quote.gas) * BigInt(quoteBResult.quote.gasPrice || '50000000000');
          }
          
          // Calculate round-trip profit
          estimatedProfitWei = calculateArbitrageProfit(inputWei, quoteBResult.quote.buyAmount);
          console.log(`[scan-evm-arbitrage] Round-trip profit: ${estimatedProfitWei} wei (${formatAmountWithDecimals(estimatedProfitWei.toString(), tokenInDecimals)} ${tokenInDecimals === 6 ? 'USDC' : 'tokens'})`);
          console.log(`[scan-evm-arbitrage] Estimated gas cost: ${estimatedGasCost} wei`);
          
          if (quoteBResult.usedRelaxedConstraints) {
            console.log(`[scan-evm-arbitrage] Note: Leg 2 used relaxed source constraints`);
          }
        } else {
          // Detailed error logging for leg 2 failure
          quoteError = `Leg 2 quote failed: ${quoteBResult.error || 'Unknown error'}`;
          console.error(`[scan-evm-arbitrage] ${quoteError}`);
          console.error(`[scan-evm-arbitrage] Leg 2 request params: ${JSON.stringify(quoteBResult.requestParams)}`);
          console.error(`[scan-evm-arbitrage] Leg 2 error code: ${quoteBResult.errorCode}`);
          console.error(`[scan-evm-arbitrage] Leg 2 retry attempts: ${quoteBResult.retryAttempts}`);
          if (quoteBResult.rawResponse) {
            console.error(`[scan-evm-arbitrage] Leg 2 raw response (redacted): ${quoteBResult.rawResponse.substring(0, 200)}`);
          }
          
          await logOpsArbitrageEvent(supabase, {
            chain: 'EVM',
            network: strategy.evm_network,
            mode: 'SCAN',
            status: 'LEG2_QUOTE_FAILED',
            strategy_id: strategy.id,
            notional_in: inputWei,
            error_message: `${quoteError} | params: ${JSON.stringify(quoteBResult.requestParams)} | code: ${quoteBResult.errorCode} | retries: ${quoteBResult.retryAttempts}`,
          });
        }
      }
    } else {
      // Detailed error logging for leg 1 failure
      quoteError = `Leg 1 quote failed: ${quoteAResult.error || 'Unknown error'}`;
      console.error(`[scan-evm-arbitrage] ${quoteError}`);
      console.error(`[scan-evm-arbitrage] Leg 1 request params: ${JSON.stringify(quoteAResult.requestParams)}`);
      console.error(`[scan-evm-arbitrage] Leg 1 error code: ${quoteAResult.errorCode}`);
      console.error(`[scan-evm-arbitrage] Leg 1 retry attempts: ${quoteAResult.retryAttempts}`);
      if (quoteAResult.rawResponse) {
        console.error(`[scan-evm-arbitrage] Leg 1 raw response (redacted): ${quoteAResult.rawResponse.substring(0, 200)}`);
      }
      
      await logOpsArbitrageEvent(supabase, {
        chain: 'EVM',
        network: strategy.evm_network,
        mode: 'SCAN',
        status: 'LEG1_QUOTE_FAILED',
        strategy_id: strategy.id,
        notional_in: inputWei,
        error_message: `${quoteError} | params: ${JSON.stringify(quoteAResult.requestParams)} | code: ${quoteAResult.errorCode} | retries: ${quoteAResult.retryAttempts}`,
      });
    }
  }

  const finishedAt = new Date().toISOString();

  // Convert profit to lamports equivalent for storage (1 ETH = 10^9 lamports conceptually)
  const profitForStorage = Number(estimatedProfitWei / BigInt(1_000_000_000));
  const gasCostForStorage = Number(estimatedGasCost / BigInt(1_000_000_000));

  // Calculate flash loan fee (9 bps = 0.09%)
  const flashLoanFeeBps = strategy.flash_loan_fee_bps || 9;
  const flashLoanFee = (BigInt(inputWei) * BigInt(flashLoanFeeBps)) / BigInt(10000);

  // Create arbitrage_runs record
  const { data: runData, error: runError } = await supabase
    .from('arbitrage_runs')
    .insert({
      strategy_id: strategy.id,
      started_at: startedAt,
      finished_at: finishedAt,
      status: 'SIMULATED',
      estimated_profit_lamports: profitForStorage,
      estimated_gas_cost_native: gasCostForStorage,
      flash_loan_amount: inputWei,
      flash_loan_fee: flashLoanFee.toString(),
      flash_loan_provider: strategy.flash_loan_provider || 'AAVE_V3',
      used_flash_loan: strategy.use_flash_loan || false,
      error_message: quoteError,
    })
    .select()
    .single();

  if (runError) {
    console.error(`[scan-evm-arbitrage] Failed to insert run:`, runError);
  }

  // Log successful scan event
  if (!quoteError) {
    await logOpsArbitrageEvent(supabase, {
      chain: 'EVM',
      network: strategy.evm_network,
      mode: 'SCAN',
      status: 'SIMULATED',
      strategy_id: strategy.id,
      notional_in: inputWei,
      expected_gross_profit: estimatedProfitWei.toString(),
      expected_net_profit: (estimatedProfitWei - estimatedGasCost - flashLoanFee).toString(),
    });
  }

  console.log(`[scan-evm-arbitrage] ========================================`);

  return {
    strategy_id: strategy.id,
    strategy_name: strategy.name,
    chain_type: 'EVM',
    evm_network: strategy.evm_network,
    dex_a: strategy.dex_a,
    dex_b: strategy.dex_b,
    token_in: strategy.token_in_mint,
    token_out: strategy.token_out_mint,
    token_in_decimals: tokenInDecimals,
    token_out_decimals: tokenOutDecimals,
    input_wei: inputWei,
    estimated_profit_wei: estimatedProfitWei.toString(),
    estimated_profit_eth: Number(estimatedProfitWei) / 1e18,
    estimated_gas_cost_wei: estimatedGasCost.toString(),
    flash_loan_fee: flashLoanFee.toString(),
    meets_min_threshold: Number(estimatedProfitWei) >= strategy.min_profit_lamports * 1_000_000_000,
    price_source: priceSource,
    is_mock: isMockPrice,
    liquidity_sources: usedSources,
    token_warnings: tokenValidation.warnings,
    run_id: runData?.id,
    error: quoteError,
    leg1_details: leg1Details,
    leg2_details: leg2Details,
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[scan-evm-arbitrage] Starting EVM arbitrage simulation scan with PARALLEL fetching...');
    const scanStartTime = Date.now();

    // Create Supabase client with service role for database access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[scan-evm-arbitrage] Fetching EVM strategies...');

    // Fetch enabled EVM strategies
    const { data: strategies, error: stratError } = await supabase
      .from('arbitrage_strategies')
      .select('*')
      .eq('is_enabled', true)
      .eq('chain_type', 'EVM');

    if (stratError) {
      console.error('[scan-evm-arbitrage] Failed to fetch strategies:', stratError);
      throw new Error('Failed to fetch strategies');
    }

    console.log(`[scan-evm-arbitrage] Found ${strategies?.length || 0} enabled EVM strategies`);

    // PARALLEL EXECUTION: Simulate all strategies concurrently
    const simulationPromises = (strategies || []).map(strategy => 
      simulateStrategy(strategy, supabase)
    );
    
    const results = await Promise.all(simulationPromises);

    const mockCount = results.filter(r => r.is_mock).length;
    const realCount = results.length - mockCount;
    const errorCount = results.filter(r => r.error).length;
    const scanDuration = Date.now() - scanStartTime;

    console.log(`[scan-evm-arbitrage] Scan complete in ${scanDuration}ms. ${results.length} EVM strategies simulated (${realCount} real, ${mockCount} mock/testnet, ${errorCount} errors).`);

    return new Response(JSON.stringify({
      success: true,
      message: 'EVM arbitrage simulation scan complete (PARALLEL)',
      supported_dexs: SUPPORTED_EVM_DEXS,
      canonical_tokens: POLYGON_CANONICAL_TOKENS,
      simulations: results,
      total_strategies: results.length,
      profitable_count: results.filter(r => r.meets_min_threshold && Number(r.estimated_profit_wei) > 0).length,
      real_price_count: realCount,
      mock_price_count: mockCount,
      error_count: errorCount,
      scan_duration_ms: scanDuration,
      note: mockCount > 0 
        ? `Using real 0x API for mainnets, mock prices for testnets (0x API does not support testnets)` 
        : 'Using real 0x API prices via zerox-client helper',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[scan-evm-arbitrage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
