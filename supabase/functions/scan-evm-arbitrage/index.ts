import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getZeroXQuote, isValidEvmAddress, calculateArbitrageProfit, isSupportedZeroXNetwork, isTestnet } from "../_shared/zerox-client.ts";

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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[scan-evm-arbitrage] Starting EVM arbitrage simulation scan...');

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

    const results = [];

    for (const strategy of strategies || []) {
      const startedAt = new Date().toISOString();
      console.log(`[scan-evm-arbitrage] Simulating strategy: ${strategy.name}`);
      console.log(`[scan-evm-arbitrage] Network: ${strategy.evm_network}`);
      console.log(`[scan-evm-arbitrage] Token In: ${strategy.token_in_mint}, Token Out: ${strategy.token_out_mint}`);
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

        results.push({
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
        });
        continue;
      }

      // Use 0.1 ETH equivalent as test input (100000000000000000 wei = 0.1 ETH)
      const inputWei = '100000000000000000';
      
      let estimatedProfitWei = BigInt(0);
      let quoteError: string | null = null;
      let usedSources: string[] = [];
      let isMockPrice = false;
      let priceSource = '0x Aggregator';

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
        const quoteA = await getZeroXQuote({
          network: strategy.evm_network,
          sellToken: strategy.token_in_mint,
          buyToken: strategy.token_out_mint,
          sellAmount: inputWei,
        });

        if (quoteA) {
          console.log(`[scan-evm-arbitrage] Leg A output: ${quoteA.buyAmount}`);
          usedSources = quoteA.sources;

          // Step 2: Get quote for token_out -> token_in (leg B - round trip)
          const quoteB = await getZeroXQuote({
            network: strategy.evm_network,
            sellToken: strategy.token_out_mint,
            buyToken: strategy.token_in_mint,
            sellAmount: quoteA.buyAmount,
          });

          if (quoteB) {
            console.log(`[scan-evm-arbitrage] Leg B output: ${quoteB.buyAmount}`);
            
            // Calculate round-trip profit
            estimatedProfitWei = calculateArbitrageProfit(inputWei, quoteB.buyAmount);
            console.log(`[scan-evm-arbitrage] Round-trip profit: ${estimatedProfitWei} wei`);
          } else {
            quoteError = 'Failed to fetch return leg quote';
          }
        } else {
          quoteError = 'Failed to fetch initial leg quote';
        }
      }

      const finishedAt = new Date().toISOString();

      // Convert profit to lamports equivalent for storage (1 ETH = 10^9 lamports conceptually)
      const profitForStorage = Number(estimatedProfitWei / BigInt(1_000_000_000));

      // Create arbitrage_runs record
      const { data: runData, error: runError } = await supabase
        .from('arbitrage_runs')
        .insert({
          strategy_id: strategy.id,
          started_at: startedAt,
          finished_at: finishedAt,
          status: 'SIMULATED',
          estimated_profit_lamports: profitForStorage,
          error_message: quoteError,
        })
        .select()
        .single();

      if (runError) {
        console.error(`[scan-evm-arbitrage] Failed to insert run:`, runError);
      }

      results.push({
        strategy_id: strategy.id,
        strategy_name: strategy.name,
        chain_type: 'EVM',
        evm_network: strategy.evm_network,
        dex_a: strategy.dex_a,
        dex_b: strategy.dex_b,
        token_in: strategy.token_in_mint,
        token_out: strategy.token_out_mint,
        input_wei: inputWei,
        estimated_profit_wei: estimatedProfitWei.toString(),
        estimated_profit_eth: Number(estimatedProfitWei) / 1e18,
        meets_min_threshold: Number(estimatedProfitWei) >= strategy.min_profit_lamports * 1_000_000_000,
        price_source: priceSource,
        is_mock: isMockPrice,
        liquidity_sources: usedSources,
        run_id: runData?.id,
        error: quoteError,
      });
    }

    const mockCount = results.filter(r => r.is_mock).length;
    const realCount = results.length - mockCount;

    console.log(`[scan-evm-arbitrage] Scan complete. ${results.length} EVM strategies simulated (${realCount} real, ${mockCount} mock/testnet).`);

    return new Response(JSON.stringify({
      success: true,
      message: 'EVM arbitrage simulation scan complete',
      supported_dexs: SUPPORTED_EVM_DEXS,
      simulations: results,
      total_strategies: results.length,
      profitable_count: results.filter(r => r.meets_min_threshold && Number(r.estimated_profit_wei) > 0).length,
      real_price_count: realCount,
      mock_price_count: mockCount,
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
