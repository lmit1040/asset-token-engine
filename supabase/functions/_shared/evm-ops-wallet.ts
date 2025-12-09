// EVM Operations Wallet Helper
// Used for internal platform operations (arbitrage, fee optimization)
// NEVER expose private key in logs or responses

import { ethers } from "https://esm.sh/ethers@6.13.2";

// Network RPC URLs (using Ankr free tier)
const NETWORK_RPC_URLS: Record<string, string> = {
  POLYGON: "https://rpc.ankr.com/polygon",
  ETHEREUM: "https://rpc.ankr.com/eth",
  ARBITRUM: "https://rpc.ankr.com/arbitrum",
  BSC: "https://rpc.ankr.com/bsc",
};

// Chain IDs for network validation
const CHAIN_IDS: Record<string, number> = {
  POLYGON: 137,
  ETHEREUM: 1,
  ARBITRUM: 42161,
  BSC: 56,
};

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

  const rpcUrl = NETWORK_RPC_URLS[normalizedNetwork];
  if (!rpcUrl) {
    throw new Error(`[evm-ops-wallet] Unsupported network: ${normalizedNetwork}. Supported: ${Object.keys(NETWORK_RPC_URLS).join(", ")}`);
  }

  const chainId = CHAIN_IDS[normalizedNetwork];

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
  return network.toUpperCase() in NETWORK_RPC_URLS;
}

/**
 * Get list of supported networks
 */
export function getSupportedEvmNetworks(): string[] {
  return Object.keys(NETWORK_RPC_URLS);
}
