// EVM Fee Payer Encryption/Decryption Utilities
// Uses XOR-based encryption for at-rest storage

import { ethers } from "https://esm.sh/ethers@6.13.2";

/**
 * Decrypt an encrypted EVM private key and return an ethers Wallet
 */
export function decryptEvmSecretKey(encryptedBase64: string, encryptionKey: string): string {
  // Decode from base64
  const encryptedBytes = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(encryptionKey);
  
  // XOR decrypt
  const decrypted = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // Convert back to hex string
  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt EVM private key for storage
 */
export function encryptEvmSecretKey(privateKeyHex: string, encryptionKey: string): string {
  const secretKeyBytes = new TextEncoder().encode(privateKeyHex);
  const keyBytes = new TextEncoder().encode(encryptionKey);
  const encrypted = new Uint8Array(secretKeyBytes.length);
  
  for (let i = 0; i < secretKeyBytes.length; i++) {
    encrypted[i] = secretKeyBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return btoa(String.fromCharCode(...encrypted));
}

/**
 * Create an ethers Wallet from decrypted private key
 */
export function createEvmWalletFromDecrypted(
  decryptedPrivateKey: string, 
  provider: ethers.JsonRpcProvider
): ethers.Wallet {
  const formattedKey = decryptedPrivateKey.startsWith("0x") 
    ? decryptedPrivateKey 
    : `0x${decryptedPrivateKey}`;
  return new ethers.Wallet(formattedKey, provider);
}
