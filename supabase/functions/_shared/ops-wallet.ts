/**
 * Shared utility for OPS_WALLET (operations wallet) used internally by edge functions.
 * 
 * This wallet is ONLY for backend operations:
 * - Running internal arbitrage strategies
 * - Funding fee payer wallets when they are low
 * 
 * NEVER use this for user funds or expose to frontend.
 */

import { Keypair } from "https://esm.sh/@solana/web3.js@1.87.6";

let opsWalletKeypair: Keypair | null = null;

/**
 * Get the OPS_WALLET Keypair from the environment variable.
 * Caches the keypair after first load for performance.
 * 
 * @throws Error if OPS_WALLET_SECRET_KEY is not set or invalid
 * @returns Solana Keypair for the operations wallet
 */
export function getOpsWalletKeypair(): Keypair {
  if (opsWalletKeypair) {
    return opsWalletKeypair;
  }

  const secretKeyEnv = Deno.env.get("OPS_WALLET_SECRET_KEY");
  
  if (!secretKeyEnv) {
    throw new Error("OPS_WALLET_SECRET_KEY environment variable is not set");
  }

  try {
    const secretKeyArray = JSON.parse(secretKeyEnv);
    
    if (!Array.isArray(secretKeyArray) || secretKeyArray.length !== 64) {
      throw new Error("OPS_WALLET_SECRET_KEY must be a JSON array of 64 bytes");
    }

    opsWalletKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
    
    console.log(`[OPS_WALLET] Loaded keypair with public key: ${opsWalletKeypair.publicKey.toBase58()}`);
    
    return opsWalletKeypair;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("OPS_WALLET_SECRET_KEY is not valid JSON");
    }
    throw error;
  }
}

/**
 * Get the OPS_WALLET public key as a base58 string.
 * Useful for logging or display without exposing the secret key.
 * 
 * @throws Error if OPS_WALLET_SECRET_KEY is not set or invalid
 * @returns Base58-encoded public key string
 */
export function getOpsWalletPublicKey(): string {
  return getOpsWalletKeypair().publicKey.toBase58();
}
