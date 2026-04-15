/** kdf.ts — PBKDF2-SHA256 key derivation. Web Crypto, zero deps. */

import type { webcrypto } from "node:crypto";

const ITERATIONS = 210_000;
const KEY_LENGTH = 32;

type CryptoKey = webcrypto.CryptoKey;

export async function deriveKey(entropy: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(entropy),
    "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    baseKey,
    { name: "AES-GCM", length: KEY_LENGTH * 8 },
    false, ["encrypt", "decrypt"]
  );
}

export function randomSalt(): Uint8Array { return crypto.getRandomValues(new Uint8Array(16)); }
export function randomIV():   Uint8Array { return crypto.getRandomValues(new Uint8Array(12)); }
