// 0x Swap API v2 Client Helper
// Used for EVM DEX price fetching and swap quotes
// NOTE: 0x API v2 uses a single base URL with chainId parameter

// 0x API v2 base URL (same for all chains)
const ZEROX_API_BASE_URL = "https://api.0x.org";

// Chain IDs for 0x API
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

// Network display names
export const NETWORK_NAMES: Record<string, string> = {
  POLYGON: "Polygon (Mainnet)",
  ETHEREUM: "Ethereum (Mainnet)",
  ARBITRUM: "Arbitrum (Mainnet)",
  BSC: "BNB Chain (Mainnet)",
  POLYGON_AMOY: "Polygon Amoy (Testnet)",
  SEPOLIA: "Ethereum Sepolia (Testnet)",
  ARBITRUM_SEPOLIA: "Arbitrum Sepolia (Testnet)",
  BSC_TESTNET: "BNB Chain Testnet",
};

// Check if network is a testnet
export function isTestnet(network: string): boolean {
  const testnets = ["POLYGON_AMOY", "SEPOLIA", "ARBITRUM_SEPOLIA", "BSC_TESTNET"];
  return testnets.includes(network.toUpperCase());
}

export interface ZeroXQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  price: string;
  guaranteedPrice?: string;
  to?: string;
  data?: string;
  gas: string;
  gasPrice?: string;
  estimatedGas: string;
  sources: string[];
  allowanceTarget?: string;
}

export interface ZeroXQuoteParams {
  network: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress?: string;
}

export class ZeroXApiError extends Error {
  public statusCode: number;
  public reason: string;

  constructor(message: string, statusCode: number, reason: string) {
    super(message);
    this.name = "ZeroXApiError";
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

/**
 * Get a swap quote from 0x API v2
 * Returns null if quote fails (no liquidity, etc.)
 */
export async function getZeroXQuote(params: ZeroXQuoteParams): Promise<ZeroXQuote | null> {
  const { network, sellToken, buyToken, sellAmount, takerAddress } = params;
  const normalizedNetwork = network.toUpperCase();

  const chainId = CHAIN_IDS[normalizedNetwork];
  if (!chainId) {
    console.error(`[zerox-client] Unsupported network: ${normalizedNetwork}`);
    return null;
  }

  const apiKey = Deno.env.get("ZEROX_API_KEY");

  if (!apiKey) {
    console.error(`[zerox-client] ZEROX_API_KEY is required for 0x API v2`);
    return null;
  }

  // Build URL with query params - use v2 allowance-holder/price endpoint
  // 0x API v2 uses single base URL with chainId parameter
  const url = new URL(`${ZEROX_API_BASE_URL}/swap/allowance-holder/price`);
  url.searchParams.set("sellToken", sellToken);
  url.searchParams.set("buyToken", buyToken);
  url.searchParams.set("sellAmount", sellAmount);
  url.searchParams.set("chainId", chainId.toString());
  
  if (takerAddress) {
    url.searchParams.set("taker", takerAddress);
  }

  console.log(`[zerox-client] Fetching quote: ${sellToken} -> ${buyToken} on ${normalizedNetwork} (chainId: ${chainId})`);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "0x-api-key": apiKey,
      "0x-version": "v2",
    };

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[zerox-client] API error (${response.status}): ${errorText.substring(0, 500)}`);
      
      // Don't throw for common non-critical errors
      if (response.status === 400 || response.status === 404) {
        return null; // No liquidity or invalid params
      }
      
      throw new ZeroXApiError(
        `0x API error: ${response.status}`,
        response.status,
        errorText
      );
    }

    const data = await response.json();
    console.log(`[zerox-client] Quote received: buyAmount=${data.buyAmount}`);

    return {
      sellToken: data.sellToken || sellToken,
      buyToken: data.buyToken || buyToken,
      sellAmount: data.sellAmount || sellAmount,
      buyAmount: data.buyAmount,
      price: data.price || "0",
      guaranteedPrice: data.guaranteedPrice,
      to: data.to,
      data: data.data,
      gas: data.gas || data.transaction?.gas || "0",
      gasPrice: data.gasPrice || data.transaction?.gasPrice,
      estimatedGas: data.estimatedGas || data.gas || "0",
      sources: data.sources?.map((s: { name: string }) => s.name) || [],
      allowanceTarget: data.allowanceTarget,
    };
  } catch (error) {
    if (error instanceof ZeroXApiError) {
      throw error;
    }
    console.error(`[zerox-client] Unexpected error:`, error);
    return null;
  }
}

/**
 * Calculate round-trip arbitrage profit in wei
 */
export function calculateArbitrageProfit(
  inputAmount: string,
  outputAmount: string
): bigint {
  const input = BigInt(inputAmount);
  const output = BigInt(outputAmount);
  return output - input;
}

/**
 * Check if a network is supported by 0x
 */
export function isSupportedZeroXNetwork(network: string): boolean {
  return network.toUpperCase() in CHAIN_IDS;
}

/**
 * Get list of supported networks
 */
export function getSupportedZeroXNetworks(): string[] {
  return Object.keys(CHAIN_IDS);
}

/**
 * Validate EVM address format
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
