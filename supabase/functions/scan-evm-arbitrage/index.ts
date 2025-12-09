import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// EVM DEX Router addresses (for reference in strategies)
const EVM_DEXS = {
  'Uniswap V2': {
    ethereum: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    polygon: '0xedf6066a2b290C185783862C7F4776A2C8077AD1',
  },
  'Uniswap V3': {
    ethereum: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    polygon: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    arbitrum: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  'SushiSwap': {
    ethereum: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
    polygon: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    arbitrum: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
  },
  'Aave V3': {
    ethereum: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    polygon: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    arbitrum: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  },
  'QuickSwap': {
    polygon: '0xa5E0829CaEd8fFDD4De3c43696c57F7D7A678ff4',
  },
  'PancakeSwap': {
    bsc: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    ethereum: '0xEfF92A263d31888d860bD50809A8D171709b7b1c',
  },
};

// Supported EVM DEXs
const SUPPORTED_EVM_DEXS = [
  'Uniswap V2',
  'Uniswap V3',
  'SushiSwap',
  'Aave V3',
  'QuickSwap',
  'PancakeSwap',
  '1inch',
  'Curve',
  'Balancer',
];

// Validate Ethereum address format
function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Get RPC URL for the network
function getRpcUrl(network: string): string | null {
  // These would typically come from environment variables in production
  const rpcUrls: Record<string, string> = {
    ETHEREUM: Deno.env.get('ETHEREUM_RPC_URL') || 'https://eth.llamarpc.com',
    POLYGON: Deno.env.get('POLYGON_RPC_URL') || 'https://polygon.llamarpc.com',
    ARBITRUM: Deno.env.get('ARBITRUM_RPC_URL') || 'https://arbitrum.llamarpc.com',
    BSC: Deno.env.get('BSC_RPC_URL') || 'https://bsc.llamarpc.com',
  };
  return rpcUrls[network] || null;
}

// Fetch price quote from 1inch API (aggregates multiple DEXs)
async function fetch1inchQuote(
  network: string,
  tokenIn: string,
  tokenOut: string,
  amountWei: string
): Promise<{ toAmount: string; estimatedGas: string; protocols: string[] } | null> {
  const chainIds: Record<string, number> = {
    ETHEREUM: 1,
    POLYGON: 137,
    ARBITRUM: 42161,
    BSC: 56,
  };

  const chainId = chainIds[network];
  if (!chainId) {
    console.error(`[scan-evm-arbitrage] Unsupported network: ${network}`);
    return null;
  }

  try {
    // Using 1inch API for price quotes (aggregates Uniswap, SushiSwap, etc.)
    const url = `https://api.1inch.dev/swap/v6.0/${chainId}/quote?src=${tokenIn}&dst=${tokenOut}&amount=${amountWei}`;
    
    const apiKey = Deno.env.get('ONEINCH_API_KEY');
    if (!apiKey) {
      console.warn('[scan-evm-arbitrage] 1inch API key not configured, using simulation');
      // Return simulated quote for demo purposes
      return simulateEvmQuote(tokenIn, tokenOut, amountWei);
    }

    console.log(`[scan-evm-arbitrage] Fetching 1inch quote: ${tokenIn} -> ${tokenOut}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[scan-evm-arbitrage] 1inch API error: ${response.status} - ${errorText}`);
      return simulateEvmQuote(tokenIn, tokenOut, amountWei);
    }

    const data = await response.json();
    return {
      toAmount: data.toAmount,
      estimatedGas: data.gas || '0',
      protocols: data.protocols?.flat()?.map((p: any) => p.name) || [],
    };
  } catch (error) {
    console.error('[scan-evm-arbitrage] Failed to fetch 1inch quote:', error);
    return simulateEvmQuote(tokenIn, tokenOut, amountWei);
  }
}

// Simulate EVM quote when API is not available
function simulateEvmQuote(
  tokenIn: string,
  tokenOut: string,
  amountWei: string
): { toAmount: string; estimatedGas: string; protocols: string[] } {
  console.log('[scan-evm-arbitrage] Using simulated quote (no API key configured)');
  
  // Simulate a small slippage (0.1% - 0.5%)
  const amount = BigInt(amountWei);
  const slippage = 0.997 + Math.random() * 0.003; // 0.3% average slippage
  const outputAmount = BigInt(Math.floor(Number(amount) * slippage));
  
  return {
    toAmount: outputAmount.toString(),
    estimatedGas: '150000',
    protocols: ['Simulated'],
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[scan-evm-arbitrage] Starting EVM arbitrage simulation scan...');

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[scan-evm-arbitrage] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError || roleData?.role !== 'admin') {
      console.error('[scan-evm-arbitrage] User is not admin:', user.id);
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[scan-evm-arbitrage] Admin verified, fetching EVM strategies...');

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

      // Validate token addresses
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
          estimated_profit_wei: 0,
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

      // Step 1: Get quote for token_in -> token_out (leg A)
      const quoteA = await fetch1inchQuote(
        strategy.evm_network,
        strategy.token_in_mint,
        strategy.token_out_mint,
        inputWei
      );

      if (quoteA) {
        console.log(`[scan-evm-arbitrage] Leg A output: ${quoteA.toAmount}`);

        // Step 2: Get quote for token_out -> token_in (leg B - round trip)
        const quoteB = await fetch1inchQuote(
          strategy.evm_network,
          strategy.token_out_mint,
          strategy.token_in_mint,
          quoteA.toAmount
        );

        if (quoteB) {
          console.log(`[scan-evm-arbitrage] Leg B output: ${quoteB.toAmount}`);
          
          // Calculate round-trip profit
          estimatedProfitWei = BigInt(quoteB.toAmount) - BigInt(inputWei);
          console.log(`[scan-evm-arbitrage] Round-trip profit: ${estimatedProfitWei} wei`);
        } else {
          quoteError = 'Failed to fetch return leg quote';
        }
      } else {
        quoteError = 'Failed to fetch initial leg quote';
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
        price_source: Deno.env.get('ONEINCH_API_KEY') ? '1inch Aggregator' : 'Simulated',
        run_id: runData?.id,
        error: quoteError,
      });
    }

    console.log(`[scan-evm-arbitrage] Scan complete. ${results.length} EVM strategies simulated.`);

    return new Response(JSON.stringify({
      success: true,
      message: 'EVM arbitrage simulation scan complete',
      supported_dexs: SUPPORTED_EVM_DEXS,
      simulations: results,
      total_strategies: results.length,
      profitable_count: results.filter(r => r.meets_min_threshold && Number(r.estimated_profit_wei) > 0).length,
      note: Deno.env.get('ONEINCH_API_KEY') 
        ? 'Using real 1inch API prices' 
        : 'Using simulated prices (add ONEINCH_API_KEY for real prices)',
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
