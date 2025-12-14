// EVM Operations Wallet Helper
// Used for internal platform operations (arbitrage, fee optimization)
// NEVER expose private key in logs or responses

import { ethers } from "https://esm.sh/ethers@6.13.2";

// Public fallback RPC URLs (rate-limited, use custom RPC for production)
const DEFAULT_RPC_URLS: Record<string, string> = {
  // Mainnets (public fallbacks)
  POLYGON: "https://polygon-rpc.com",
  ETHEREUM: "https://eth.llamarpc.com",
  ARBITRUM: "https://arb1.arbitrum.io/rpc",
  BSC: "https://bsc-dataseed1.binance.org",
  // Testnets
  POLYGON_AMOY: "https://rpc-amoy.polygon.technology",
  SEPOLIA: "https://ethereum-sepolia-rpc.publicnode.com",
  ARBITRUM_SEPOLIA: "https://sepolia-rollup.arbitrum.io/rpc",
  BSC_TESTNET: "https://data-seed-prebsc-1-s1.binance.org:8545",
};

// Environment variable names for custom RPC URLs (Alchemy, Infura, QuickNode)
const RPC_ENV_VARS: Record<string, string> = {
  POLYGON: "EVM_POLYGON_RPC_URL",
  ETHEREUM: "EVM_ETHEREUM_RPC_URL",
  ARBITRUM: "EVM_ARBITRUM_RPC_URL",
  BSC: "EVM_BSC_RPC_URL",
};

// Chain IDs for network validation
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

/**
 * Get the RPC URL for a network, preferring custom env vars over public fallbacks
 */
export function getEvmRpcUrl(network: string): string {
  const normalizedNetwork = network.toUpperCase();
  
  // Check for custom RPC URL from environment variable
  const envVar = RPC_ENV_VARS[normalizedNetwork];
  if (envVar) {
    const customUrl = Deno.env.get(envVar);
    if (customUrl) {
      console.log(`[evm-ops-wallet] Using custom RPC for ${normalizedNetwork} from ${envVar}`);
      return customUrl;
    }
  }
  
  // Fall back to default public RPC
  const defaultUrl = DEFAULT_RPC_URLS[normalizedNetwork];
  if (!defaultUrl) {
    throw new Error(`[evm-ops-wallet] Unsupported network: ${normalizedNetwork}`);
  }
  
  console.log(`[evm-ops-wallet] Using public RPC fallback for ${normalizedNetwork}`);
  return defaultUrl;
}

export interface EvmOpsWallet {
  wallet: ethers.Wallet;
  provider: ethers.JsonRpcProvider;
  address: string;
  network: string;
  chainId: number;
}

// Cache wallet instances per network
const walletCache: Record<string, EvmOpsWallet> = {};

/**
 * Get the EVM operations wallet for a specific network
 * Defaults to Polygon if no network specified
 */
export function getEvmOpsWallet(network: string = "POLYGON"): EvmOpsWallet {
  const normalizedNetwork = network.toUpperCase();
  
  // Return cached instance if available
  if (walletCache[normalizedNetwork]) {
    console.log(`[evm-ops-wallet] Using cached wallet for ${normalizedNetwork}`);
    return walletCache[normalizedNetwork];
  }

  const privateKey = Deno.env.get("EVM_OPS_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("[evm-ops-wallet] EVM_OPS_PRIVATE_KEY not configured");
  }

  const chainId = CHAIN_IDS[normalizedNetwork];
  if (!chainId) {
    throw new Error(`[evm-ops-wallet] Unsupported network: ${normalizedNetwork}. Supported: ${Object.keys(CHAIN_IDS).join(", ")}`);
  }

  const rpcUrl = getEvmRpcUrl(normalizedNetwork);

  console.log(`[evm-ops-wallet] Initializing wallet for ${normalizedNetwork} (chainId: ${chainId})`);

  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
  
  // Ensure private key has 0x prefix
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(formattedKey, provider);

  const opsWallet: EvmOpsWallet = {
    wallet,
    provider,
    address: wallet.address,
    network: normalizedNetwork,
    chainId,
  };

  // Cache the wallet instance
  walletCache[normalizedNetwork] = opsWallet;

  console.log(`[evm-ops-wallet] Wallet initialized: ${wallet.address} on ${normalizedNetwork}`);

  return opsWallet;
}

/**
 * Get the EVM OPS wallet address without exposing the wallet instance
 */
export function getEvmOpsAddress(network: string = "POLYGON"): string {
  const { address } = getEvmOpsWallet(network);
  return address;
}

/**
 * Get native token balance (MATIC, ETH, etc.) for the OPS wallet
 */
export async function getEvmOpsBalance(network: string = "POLYGON"): Promise<string> {
  const { wallet, provider } = getEvmOpsWallet(network);
  const balance = await provider.getBalance(wallet.address);
  return ethers.formatEther(balance);
}

/**
 * Check if a network is supported
 */
export function isSupportedEvmNetwork(network: string): boolean {
  return network.toUpperCase() in CHAIN_IDS;
}

/**
 * Get list of supported networks
 */
export function getSupportedEvmNetworks(): string[] {
  return Object.keys(CHAIN_IDS);
}

/**
 * Check which mainnet RPC URLs are configured via environment variables
 */
export function getConfiguredEvmRpcStatus(): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const [network, envVar] of Object.entries(RPC_ENV_VARS)) {
    status[network] = !!Deno.env.get(envVar);
  }
  return status;
}
