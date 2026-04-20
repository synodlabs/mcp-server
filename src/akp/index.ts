/**
 * akp/index.ts — Agent Key Provider
 * Internal module of @synod/mcp-server. Not exported publicly.
 * Private key never leaves this module.
 */

import { generateKeypair, keypairFromBytes } from "./core/keygen.js";
import { sign as _sign, verify as _verify, type Signature } from "./core/signer.js";
import { resolveStorage, memoryFallback, type StorageType, type ResolvedStorage } from "./storage/resolve.js";
import { canonicalJsonBytes } from "../lib/canonical.js";
import { Keypair } from "@stellar/stellar-sdk";

export type { Signature, StorageType };

export interface AKPIdentity {
  publicKey:   string;
  keyId:       string;
  existed:     boolean;
  storageType: StorageType;
}

export class KeyProvider {
  private readonly _pub: string;
  private readonly _keyId: string;
  private readonly _storage: ResolvedStorage;

  constructor(pub: string, keyId: string, storage: ResolvedStorage) {
    this._pub     = pub;
    this._keyId   = keyId;
    this._storage = storage;
  }

  static async init(): Promise<{ provider: KeyProvider; identity: AKPIdentity }> {
    try {
      return await initWithStorage(await resolveStorage());
    } catch {
      return initWithStorage(memoryFallback());
    }
  }

  async sign(payload: Uint8Array): Promise<Signature> {
    const raw = await this._storage.load();
    if (!raw) throw new Error("AKP: No key in storage — call init() first");
    return _sign(payload, raw, this._pub);
  }

  async signText(text: string): Promise<Signature> {
    return this.sign(new TextEncoder().encode(text));
  }

  /**
   * Sign a challenge object for the Synod connect handshake.
   * Canonical JSON → UTF-8 → SHA-256 → Ed25519 sign
   */
  async signChallenge(nonce: string): Promise<Signature> {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      canonicalJsonBytes({ action: "connect", domain: "synod", nonce })
    );
    return this.sign(new Uint8Array(hash));
  }

  async withKeypair<T>(fn: (keypair: Keypair) => Promise<T> | T): Promise<T> {
    const raw = await this._storage.load();
    if (!raw) throw new Error("AKP: No key in storage — call init() first");

    try {
      const keypair = Keypair.fromRawEd25519Seed(Buffer.from(raw));
      return await fn(keypair);
    } finally {
      raw.fill(0);
    }
  }

  verify(payload: Uint8Array, signature: string): boolean {
    return _verify(payload, signature, this._pub);
  }

  getPublicKey():   string      { return this._pub; }
  getKeyId():       string      { return this._keyId; }
  getStorageType(): StorageType { return this._storage.type; }

  async destroy(): Promise<void> { await this._storage.clear(); }
}

async function initWithStorage(storage: ResolvedStorage): Promise<{ provider: KeyProvider; identity: AKPIdentity }> {
  let existed = true;
  let raw = await storage.load();

  if (!raw) {
    existed = false;
    const material = await generateKeypair();

    try {
      await storage.save(material.privateKeyBytes, {
        publicKey: material.publicKey,
        keyId: material.keyId,
      });
      raw = await storage.load() ?? new Uint8Array(material.privateKeyBytes);
    } finally {
      material.privateKeyBytes.fill(0);
    }

    return {
      provider: new KeyProvider(material.publicKey, material.keyId, storage),
      identity: {
        publicKey: material.publicKey,
        keyId: material.keyId,
        existed,
        storageType: storage.type,
      },
    };
  }

  const material = await keypairFromBytes(raw);
  raw.fill(0);

  try {
    return {
      provider: new KeyProvider(material.publicKey, material.keyId, storage),
      identity: {
        publicKey: material.publicKey,
        keyId: material.keyId,
        existed,
        storageType: storage.type,
      },
    };
  } finally {
    material.privateKeyBytes.fill(0);
  }
}
