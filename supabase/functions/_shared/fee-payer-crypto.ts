import { Keypair } from "https://esm.sh/@solana/web3.js@1.87.6";

/**
 * Decrypt an encrypted secret key and return a Keypair
 * Uses XOR-based encryption (matches generate-fee-payer encryption)
 */
export function decryptSecretKey(encryptedBase64: string, encryptionKey: string): Keypair {
  // Decode from base64
  const encryptedBytes = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(encryptionKey);
  
  // XOR decrypt
  const decrypted = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return Keypair.fromSecretKey(decrypted);
}

/**
 * Encrypt secret key bytes for storage
 */
export function encryptSecretKey(secretKeyBytes: Uint8Array, encryptionKey: string): string {
  const keyBytes = new TextEncoder().encode(encryptionKey);
  const encrypted = new Uint8Array(secretKeyBytes.length);
  
  for (let i = 0; i < secretKeyBytes.length; i++) {
    encrypted[i] = secretKeyBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return btoa(String.fromCharCode(...encrypted));
}
