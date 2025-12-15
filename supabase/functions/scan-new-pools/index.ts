import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// DEX Factory addresses on Polygon
const DEX_FACTORIES: Record<string, { address: string; type: string }> = {
  "Uniswap V3": {
    address: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    type: "v3",
  },
  "QuickSwap V3": {
    address: "0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28",
    type: "v3",
  },
  "SushiSwap": {
    address: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    type: "v2",
  },
};

// Known stablecoins/major tokens (safer to trade against)
const SAFE_BASE_TOKENS = [
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC
  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
  "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
  "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH
  "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", // DAI
].map((a) => a.toLowerCase());

// Minimum liquidity to consider (in USD)
const MIN_LIQUIDITY_USD = 10000;

// Maximum age of pool to consider "new" (in blocks, ~2 seconds per block on Polygon)
const MAX_POOL_AGE_BLOCKS = 1800; // ~1 hour

// Rug-pull detection heuristics
interface RugRiskResult {
  isRisky: boolean;
  reasons: string[];
}

async function checkRugRisk(
  provider: ethers.JsonRpcProvider,
  tokenAddress: string
): Promise<RugRiskResult> {
  const reasons: string[] = [];

  try {
    // ERC20 ABI for basic checks
    const erc20Abi = [
      "function totalSupply() view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
      "function owner() view returns (address)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
    ];

    const token = new ethers.Contract(tokenAddress, erc20Abi, provider);

    // Check 1: Can we read basic token info?
    try {
      await token.symbol();
      await token.decimals();
    } catch {
      reasons.push("Cannot read token metadata (possible honeypot)");
    }

    // Check 2: Check total supply
    try {
      const totalSupply = await token.totalSupply();
      if (totalSupply === 0n) {
        reasons.push("Zero total supply");
      }
    } catch {
      reasons.push("Cannot read total supply");
    }

    // Check 3: Check if contract has owner function (centralization risk)
    try {
      const owner = await token.owner();
      if (owner && owner !== ethers.ZeroAddress) {
        reasons.push("Token has active owner (centralization risk)");
      }
    } catch {
      // No owner function is actually good - decentralized
    }

    // Check 4: Verify contract bytecode exists
    const code = await provider.getCode(tokenAddress);
    if (code === "0x" || code.length < 100) {
      reasons.push("Minimal or no contract bytecode");
    }
  } catch (error) {
    console.error(`[scan-new-pools] Error checking rug risk for ${tokenAddress}:`, error);
    reasons.push("Error during rug risk analysis");
  }

  return {
    isRisky: reasons.length > 0,
    reasons,
  };
}

// Fetch recent pool creation events from factory
async function scanFactory(
  provider: ethers.JsonRpcProvider,
  dexName: string,
  factoryAddress: string,
  factoryType: string,
  fromBlock: number,
  toBlock: number
): Promise<any[]> {
  const pools: any[] = [];

  try {
    // V3 Factory event signature
    const v3EventSignature = "PoolCreated(address,address,uint24,int24,address)";
    // V2 Factory event signature
    const v2EventSignature = "PairCreated(address,address,address,uint256)";

    const eventSignature = factoryType === "v3" ? v3EventSignature : v2EventSignature;
    const eventTopic = ethers.id(eventSignature);

    console.log(`[scan-new-pools] Scanning ${dexName} from block ${fromBlock} to ${toBlock}`);

    const logs = await provider.getLogs({
      address: factoryAddress,
      topics: [eventTopic],
      fromBlock,
      toBlock,
    });

    console.log(`[scan-new-pools] Found ${logs.length} pool creation events on ${dexName}`);

    for (const log of logs) {
      try {
        let token0: string, token1: string, poolAddress: string;

        if (factoryType === "v3") {
          // V3: PoolCreated(token0, token1, fee, tickSpacing, pool)
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["int24", "address"],
            log.data
          );
          token0 = ethers.getAddress("0x" + log.topics[1].slice(26));
          token1 = ethers.getAddress("0x" + log.topics[2].slice(26));
          poolAddress = decoded[1];
        } else {
          // V2: PairCreated(token0, token1, pair, allPairsLength)
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "uint256"],
            log.data
          );
          token0 = ethers.getAddress("0x" + log.topics[1].slice(26));
          token1 = ethers.getAddress("0x" + log.topics[2].slice(26));
          poolAddress = decoded[0];
        }

        pools.push({
          dex: dexName,
          pool_address: poolAddress,
          token0_address: token0,
          token1_address: token1,
          created_block: log.blockNumber,
        });
      } catch (error) {
        console.error(`[scan-new-pools] Error parsing log:`, error);
      }
    }
  } catch (error) {
    console.error(`[scan-new-pools] Error scanning ${dexName}:`, error);
  }

  return pools;
}

// Get token symbol
async function getTokenSymbol(
  provider: ethers.JsonRpcProvider,
  tokenAddress: string
): Promise<string> {
  try {
    const contract = new ethers.Contract(
      tokenAddress,
      ["function symbol() view returns (string)"],
      provider
    );
    return await contract.symbol();
  } catch {
    return "UNKNOWN";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[scan-new-pools] Starting new pool scan...");

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get RPC URL
    const rpcUrl = Deno.env.get("EVM_POLYGON_RPC_URL") || "https://polygon-rpc.com";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Get current block
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - MAX_POOL_AGE_BLOCKS;

    console.log(`[scan-new-pools] Scanning blocks ${fromBlock} to ${currentBlock}`);

    // Scan all DEX factories
    const allPools: any[] = [];
    for (const [dexName, factory] of Object.entries(DEX_FACTORIES)) {
      const pools = await scanFactory(
        provider,
        dexName,
        factory.address,
        factory.type,
        fromBlock,
        currentBlock
      );
      allPools.push(...pools);
    }

    console.log(`[scan-new-pools] Total new pools found: ${allPools.length}`);

    // Filter and enrich pools
    const enrichedPools: any[] = [];
    const skippedPools: any[] = [];

    for (const pool of allPools) {
      // Check if already in database
      const { data: existing } = await supabase
        .from("detected_pools")
        .select("id")
        .eq("pool_address", pool.pool_address)
        .eq("chain", "POLYGON")
        .single();

      if (existing) {
        console.log(`[scan-new-pools] Pool ${pool.pool_address} already tracked`);
        continue;
      }

      // Check if one token is a safe base token
      const token0Lower = pool.token0_address.toLowerCase();
      const token1Lower = pool.token1_address.toLowerCase();
      const hasBaseToken =
        SAFE_BASE_TOKENS.includes(token0Lower) || SAFE_BASE_TOKENS.includes(token1Lower);

      if (!hasBaseToken) {
        skippedPools.push({
          ...pool,
          skip_reason: "No safe base token in pair",
        });
        continue;
      }

      // Determine which is the new token
      const newTokenAddress = SAFE_BASE_TOKENS.includes(token0Lower)
        ? pool.token1_address
        : pool.token0_address;

      // Get token symbols
      const token0Symbol = await getTokenSymbol(provider, pool.token0_address);
      const token1Symbol = await getTokenSymbol(provider, pool.token1_address);

      // Check rug risk on the new token
      const rugRisk = await checkRugRisk(provider, newTokenAddress);

      const enrichedPool = {
        ...pool,
        chain: "POLYGON",
        token0_symbol: token0Symbol,
        token1_symbol: token1Symbol,
        is_rug_risk: rugRisk.isRisky,
        rug_risk_reasons: rugRisk.reasons,
        status: rugRisk.isRisky ? "RUG_DETECTED" : "NEW",
      };

      enrichedPools.push(enrichedPool);

      // Insert into database
      const { error: insertError } = await supabase.from("detected_pools").insert(enrichedPool);

      if (insertError) {
        console.error(`[scan-new-pools] Error inserting pool:`, insertError);
      } else {
        console.log(
          `[scan-new-pools] Inserted pool: ${token0Symbol}/${token1Symbol} on ${pool.dex} (rug_risk: ${rugRisk.isRisky})`
        );
      }
    }

    // Get pools ready for arbitrage attempt
    const { data: readyPools } = await supabase
      .from("detected_pools")
      .select("*")
      .eq("status", "NEW")
      .eq("is_rug_risk", false)
      .eq("arbitrage_attempted", false)
      .limit(5);

    console.log(`[scan-new-pools] Pools ready for arbitrage: ${readyPools?.length || 0}`);

    return new Response(
      JSON.stringify({
        success: true,
        scan_range: {
          from_block: fromBlock,
          to_block: currentBlock,
        },
        new_pools_found: allPools.length,
        pools_added: enrichedPools.length,
        pools_skipped: skippedPools.length,
        pools_ready_for_arbitrage: readyPools?.length || 0,
        skipped_reasons: skippedPools.slice(0, 5).map((p) => ({
          pool: p.pool_address,
          reason: p.skip_reason,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[scan-new-pools] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
