import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RpcEndpointConfig {
  name: string;
  envVar: string | null;
  fallback: string;
  testMethod: 'solana' | 'evm';
  chainId?: number;
  isMainnet: boolean;
}

// RPC endpoints configuration
const RPC_ENDPOINTS: Record<string, RpcEndpointConfig> = {
  SOLANA_MAINNET: {
    name: 'Solana Mainnet',
    envVar: 'SOLANA_MAINNET_RPC_URL',
    fallback: 'https://api.mainnet-beta.solana.com',
    testMethod: 'solana',
    isMainnet: true,
  },
  SOLANA_DEVNET: {
    name: 'Solana Devnet',
    envVar: 'SOLANA_DEVNET_RPC_URL',
    fallback: 'https://api.devnet.solana.com',
    testMethod: 'solana',
    isMainnet: false,
  },
  POLYGON: {
    name: 'Polygon',
    envVar: 'EVM_POLYGON_RPC_URL',
    fallback: 'https://polygon-rpc.com',
    testMethod: 'evm',
    chainId: 137,
    isMainnet: true,
  },
  POLYGON_AMOY: {
    name: 'Polygon Amoy',
    envVar: null,
    fallback: 'https://rpc-amoy.polygon.technology',
    testMethod: 'evm',
    chainId: 80002,
    isMainnet: false,
  },
  ETHEREUM: {
    name: 'Ethereum',
    envVar: 'EVM_ETHEREUM_RPC_URL',
    fallback: 'https://eth.llamarpc.com',
    testMethod: 'evm',
    chainId: 1,
    isMainnet: true,
  },
  SEPOLIA: {
    name: 'Sepolia',
    envVar: null,
    fallback: 'https://ethereum-sepolia-rpc.publicnode.com',
    testMethod: 'evm',
    chainId: 11155111,
    isMainnet: false,
  },
  ARBITRUM: {
    name: 'Arbitrum',
    envVar: 'EVM_ARBITRUM_RPC_URL',
    fallback: 'https://arb1.arbitrum.io/rpc',
    testMethod: 'evm',
    chainId: 42161,
    isMainnet: true,
  },
  ARBITRUM_SEPOLIA: {
    name: 'Arbitrum Sepolia',
    envVar: null,
    fallback: 'https://sepolia-rollup.arbitrum.io/rpc',
    testMethod: 'evm',
    chainId: 421614,
    isMainnet: false,
  },
  BSC: {
    name: 'BSC',
    envVar: 'EVM_BSC_RPC_URL',
    fallback: 'https://bsc-dataseed1.binance.org',
    testMethod: 'evm',
    chainId: 56,
    isMainnet: true,
  },
  BSC_TESTNET: {
    name: 'BSC Testnet',
    envVar: null,
    fallback: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    testMethod: 'evm',
    chainId: 97,
    isMainnet: false,
  },
};

interface RpcTestResult {
  network: string;
  name: string;
  url: string;
  isCustomRpc: boolean;
  isMainnet: boolean;
  status: 'ok' | 'error' | 'timeout';
  latencyMs: number | null;
  error?: string;
  blockNumber?: number | string;
}

async function testSolanaRpc(url: string, timeoutMs: number = 5000): Promise<{ latencyMs: number; slot: number }> {
  const startTime = performance.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSlot',
        params: [],
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - startTime);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || 'RPC error');
    }
    
    return { latencyMs, slot: data.result };
  } catch (err) {
    clearTimeout(timeoutId);
    const error = err as Error;
    if (error.name === 'AbortError') {
      throw new Error('Timeout');
    }
    throw error;
  }
}

async function testEvmRpc(url: string, expectedChainId: number, timeoutMs: number = 5000): Promise<{ latencyMs: number; blockNumber: number }> {
  const startTime = performance.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // First get block number
    const blockResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - startTime);
    
    if (!blockResponse.ok) {
      throw new Error(`HTTP ${blockResponse.status}`);
    }
    
    const blockData = await blockResponse.json();
    if (blockData.error) {
      throw new Error(blockData.error.message || 'RPC error');
    }
    
    const blockNumber = parseInt(blockData.result, 16);
    
    return { latencyMs, blockNumber };
  } catch (err) {
    clearTimeout(timeoutId);
    const error = err as Error;
    if (error.name === 'AbortError') {
      throw new Error('Timeout');
    }
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { testMainnet = true, testTestnet = true } = await req.json().catch(() => ({}));
    
    console.log('[test-rpc-connectivity] Starting RPC connectivity tests...');
    console.log(`[test-rpc-connectivity] Test mainnet: ${testMainnet}, Test testnet: ${testTestnet}`);
    
    const results: RpcTestResult[] = [];
    const testPromises: Promise<void>[] = [];
    
    for (const [networkKey, config] of Object.entries(RPC_ENDPOINTS)) {
      // Skip based on network type
      if (config.isMainnet && !testMainnet) continue;
      if (!config.isMainnet && !testTestnet) continue;
      
      testPromises.push((async () => {
        const url = config.envVar ? (Deno.env.get(config.envVar) || config.fallback) : config.fallback;
        const isCustomRpc = config.envVar ? !!Deno.env.get(config.envVar) : false;
        
        const result: RpcTestResult = {
          network: networkKey,
          name: config.name,
          url: url.replace(/\/v2\/[a-zA-Z0-9]+/, '/v2/***'), // Mask API keys in URL
          isCustomRpc,
          isMainnet: config.isMainnet,
          status: 'error',
          latencyMs: null,
        };
        
        try {
          if (config.testMethod === 'solana') {
            const { latencyMs, slot } = await testSolanaRpc(url);
            result.status = 'ok';
            result.latencyMs = latencyMs;
            result.blockNumber = slot;
          } else if (config.testMethod === 'evm') {
            const { latencyMs, blockNumber } = await testEvmRpc(url, config.chainId!);
            result.status = 'ok';
            result.latencyMs = latencyMs;
            result.blockNumber = blockNumber;
          }
          console.log(`[test-rpc-connectivity] ${config.name}: OK (${result.latencyMs}ms)`);
        } catch (err) {
          const error = err as Error;
          if (error.message === 'Timeout') {
            result.status = 'timeout';
            result.error = 'Connection timeout (5s)';
          } else {
            result.status = 'error';
            result.error = error.message || 'Unknown error';
          }
          console.log(`[test-rpc-connectivity] ${config.name}: ${result.status} - ${result.error}`);
        }
        
        results.push(result);
      })());
    }
    
    // Run all tests in parallel
    await Promise.all(testPromises);
    
    // Sort by network name
    results.sort((a, b) => a.name.localeCompare(b.name));
    
    // Calculate summary
    const mainnetResults = results.filter(r => r.isMainnet);
    const testnetResults = results.filter(r => !r.isMainnet);
    
    const mainnetOk = mainnetResults.filter(r => r.status === 'ok').length;
    const mainnetTotal = mainnetResults.length;
    const testnetOk = testnetResults.filter(r => r.status === 'ok').length;
    const testnetTotal = testnetResults.length;
    
    const canEnableMainnet = mainnetResults.every(r => r.status === 'ok');
    
    const summary = {
      mainnetReady: canEnableMainnet,
      mainnetOk,
      mainnetTotal,
      testnetOk,
      testnetTotal,
      avgMainnetLatency: mainnetResults.filter(r => r.latencyMs !== null).length > 0
        ? Math.round(mainnetResults.filter(r => r.latencyMs !== null).reduce((sum, r) => sum + r.latencyMs!, 0) / mainnetResults.filter(r => r.latencyMs !== null).length)
        : null,
      avgTestnetLatency: testnetResults.filter(r => r.latencyMs !== null).length > 0
        ? Math.round(testnetResults.filter(r => r.latencyMs !== null).reduce((sum, r) => sum + r.latencyMs!, 0) / testnetResults.filter(r => r.latencyMs !== null).length)
        : null,
    };
    
    console.log(`[test-rpc-connectivity] Summary: Mainnet ${mainnetOk}/${mainnetTotal}, Testnet ${testnetOk}/${testnetTotal}, Can enable mainnet: ${canEnableMainnet}`);
    
    return new Response(JSON.stringify({ results, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (err) {
    const error = err as Error;
    console.error('[test-rpc-connectivity] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
