/** aes.ts — AES-256-GCM authenticated encryption. Web Crypto, zero deps. */

import type { webcrypto } from "node:crypto";

import { randomIV } from "./kdf.js";

export interface EncryptedBlob { ciphertext: string; iv: string; }

type CryptoKey = webcrypto.CryptoKey;

export async function encrypt(plain: Uint8Array, key: CryptoKey): Promise<EncryptedBlob> {
  const iv = randomIV();
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { ciphertext: b64(new Uint8Array(buf)), iv: b64(iv) };
}

export async function decrypt(blob: EncryptedBlob, key: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ciphertext)
  );
  return new Uint8Array(buf);
}

const b64   = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string)     => new Uint8Array(Buffer.from(s, "base64"));
