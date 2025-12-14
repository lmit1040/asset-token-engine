import { Connection } from "https://esm.sh/@solana/web3.js@1.98.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const DEVNET_RPC_DEFAULT = 'https://api.devnet.solana.com';
const MAINNET_RPC_FALLBACK = 'https://api.mainnet-beta.solana.com';

export interface SolanaConnectionResult {
  connection: Connection;
  isMainnet: boolean;
  rpcUrl: string;
}

/**
 * Get a Solana Connection that automatically switches between mainnet and devnet
 * based on the system_settings.is_mainnet_mode flag.
 */
export async function getSolanaConnection(): Promise<SolanaConnectionResult> {
  // Check system settings for mainnet mode
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: settings } = await supabase
    .from('system_settings')
    .select('is_mainnet_mode')
    .limit(1)
    .maybeSingle();
  
  const isMainnet = settings?.is_mainnet_mode === true;
  
  let rpcUrl: string;
  if (isMainnet) {
    // Use mainnet RPC (Helius, QuickNode, Triton, Alchemy)
    rpcUrl = Deno.env.get('SOLANA_MAINNET_RPC_URL') || MAINNET_RPC_FALLBACK;
    console.log('[solana-connection] Using MAINNET RPC');
  } else {
    // Use devnet RPC
    rpcUrl = Deno.env.get('SOLANA_DEVNET_RPC_URL') || DEVNET_RPC_DEFAULT;
    console.log('[solana-connection] Using DEVNET RPC');
  }
  
  const connection = new Connection(rpcUrl, 'confirmed');
  
  return { connection, isMainnet, rpcUrl };
}

/**
 * Get the appropriate Solana explorer URL for a transaction
 */
export function getExplorerUrl(signature: string, isMainnet: boolean): string {
  if (isMainnet) {
    return `https://solscan.io/tx/${signature}`;
  }
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

/**
 * Get the appropriate Solana explorer URL for an address
 */
export function getAddressExplorerUrl(address: string, isMainnet: boolean): string {
  if (isMainnet) {
    return `https://solscan.io/account/${address}`;
  }
  return `https://solscan.io/account/${address}?cluster=devnet`;
}
