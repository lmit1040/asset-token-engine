// EVM Network Mode Helper
// Maps mainnet networks to their testnet equivalents based on is_mainnet_mode

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// Mainnet to Testnet mapping
const MAINNET_TO_TESTNET: Record<string, string> = {
  POLYGON: "POLYGON_AMOY",
  ETHEREUM: "SEPOLIA",
  ARBITRUM: "ARBITRUM_SEPOLIA",
  BSC: "BSC_TESTNET",
};

// Testnet to Mainnet mapping (reverse)
const TESTNET_TO_MAINNET: Record<string, string> = {
  POLYGON_AMOY: "POLYGON",
  SEPOLIA: "ETHEREUM",
  ARBITRUM_SEPOLIA: "ARBITRUM",
  BSC_TESTNET: "BSC",
};

// All mainnet networks
const MAINNET_NETWORKS = ["POLYGON", "ETHEREUM", "ARBITRUM", "BSC"];

// All testnet networks
const TESTNET_NETWORKS = ["POLYGON_AMOY", "SEPOLIA", "ARBITRUM_SEPOLIA", "BSC_TESTNET"];

export interface NetworkModeResult {
  isMainnet: boolean;
  network: string;
  originalNetwork: string;
}

/**
 * Check if the system is in mainnet mode
 */
export async function isMainnetMode(): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: settings } = await supabase
    .from("system_settings")
    .select("is_mainnet_mode")
    .limit(1)
    .maybeSingle();

  return settings?.is_mainnet_mode === true;
}

/**
 * Get the appropriate network based on mainnet mode.
 * If mainnet mode is enabled, returns the mainnet network.
 * If mainnet mode is disabled, returns the corresponding testnet.
 */
export async function getNetworkForMode(network: string): Promise<NetworkModeResult> {
  const normalizedNetwork = network.toUpperCase();
  const isMainnet = await isMainnetMode();

  if (isMainnet) {
    // In mainnet mode, use mainnet networks
    // If given a testnet, convert to mainnet
    if (TESTNET_NETWORKS.includes(normalizedNetwork)) {
      const mainnetNetwork = TESTNET_TO_MAINNET[normalizedNetwork];
      console.log(`[evm-network-mode] Mainnet mode: ${normalizedNetwork} → ${mainnetNetwork}`);
      return {
        isMainnet: true,
        network: mainnetNetwork,
        originalNetwork: normalizedNetwork,
      };
    }
    // Already a mainnet network
    return {
      isMainnet: true,
      network: normalizedNetwork,
      originalNetwork: normalizedNetwork,
    };
  } else {
    // In testnet mode, use testnet networks
    // If given a mainnet, convert to testnet
    if (MAINNET_NETWORKS.includes(normalizedNetwork)) {
      const testnetNetwork = MAINNET_TO_TESTNET[normalizedNetwork];
      console.log(`[evm-network-mode] Testnet mode: ${normalizedNetwork} → ${testnetNetwork}`);
      return {
        isMainnet: false,
        network: testnetNetwork,
        originalNetwork: normalizedNetwork,
      };
    }
    // Already a testnet network
    return {
      isMainnet: false,
      network: normalizedNetwork,
      originalNetwork: normalizedNetwork,
    };
  }
}

/**
 * Get all networks for the current mode
 */
export async function getAllNetworksForMode(): Promise<string[]> {
  const isMainnet = await isMainnetMode();
  return isMainnet ? MAINNET_NETWORKS : TESTNET_NETWORKS;
}

/**
 * Check if a network matches the current mode
 */
export function isNetworkMainnet(network: string): boolean {
  return MAINNET_NETWORKS.includes(network.toUpperCase());
}

/**
 * Check if a network matches testnet mode
 */
export function isNetworkTestnet(network: string): boolean {
  return TESTNET_NETWORKS.includes(network.toUpperCase());
}
