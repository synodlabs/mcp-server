/**
 * tools/identity.ts — initialize_identity tool
 * Boots AKP, returns public key + metadata. Safe to call multiple times (idempotent).
 */

import { KeyProvider, type AKPIdentity } from "../akp/index.js";

let _provider: KeyProvider | null = null;
let _identity: AKPIdentity | null = null;

/** Returns the cached provider. Throws if init() not called yet. */
export function getProvider(): KeyProvider {
  if (!_provider) throw new Error("Agent identity not initialized. Call initialize_identity first.");
  return _provider;
}

export function getIdentity(): AKPIdentity | null {
  return _identity;
}

export function resetIdentityState(): void {
  _provider = null;
  _identity = null;
}

export async function initializeIdentity(): Promise<{
  public_key:   string;
  key_id:       string;
  existed:      boolean;
  storage_type: string;
  message:      string;
}> {
  if (_provider && _identity) {
    return {
      public_key:   _identity.publicKey,
      key_id:       _identity.keyId,
      existed:      _identity.existed,
      storage_type: _identity.storageType,
      message:      "Identity already initialized (cached).",
    };
  }

  const { provider, identity } = await KeyProvider.init();
  _provider = provider;
  _identity = identity;

  return {
    public_key:   identity.publicKey,
    key_id:       identity.keyId,
    existed:      identity.existed,
    storage_type: identity.storageType,
    message: identity.existed
      ? `Identity loaded from ${identity.storageType}. Public key: ${identity.publicKey}`
      : `New identity generated and stored in ${identity.storageType}. Public key: ${identity.publicKey}. Copy this public key — you will need to paste it into the Synod dashboard to bind this agent.`,
  };
}
