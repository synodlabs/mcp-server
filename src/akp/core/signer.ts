import { Keypair } from "@stellar/stellar-sdk";

export interface Signature { signature: string; publicKey: string; }

export function sign(payload: Uint8Array, privateKeyBytes: Uint8Array, publicKey: string): Signature {
  try {
    const kp  = Keypair.fromRawEd25519Seed(Buffer.from(privateKeyBytes));
    const sig = kp.sign(Buffer.from(payload));
    return { signature: Buffer.from(sig).toString("base64"), publicKey };
  } finally {
    privateKeyBytes.fill(0);
  }
}

export function verify(payload: Uint8Array, signature: string, publicKey: string): boolean {
  try {
    return Keypair.fromPublicKey(publicKey).verify(
      Buffer.from(payload),
      Buffer.from(signature, "base64")
    );
  } catch { return false; }
}
