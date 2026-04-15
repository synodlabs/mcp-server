import { Keypair } from "@stellar/stellar-sdk";

export interface KeyMaterial {
  publicKey: string;
  privateKeyBytes: Uint8Array;
  keyId: string;
}

export async function generateKeypair(): Promise<KeyMaterial> {
  return buildMaterial(Keypair.random());
}

export async function keypairFromBytes(b: Uint8Array): Promise<KeyMaterial> {
  return buildMaterial(Keypair.fromRawEd25519Seed(Buffer.from(b)));
}

async function buildMaterial(kp: Keypair): Promise<KeyMaterial> {
  const publicKey = kp.publicKey();
  const keyId     = await keyIdFrom(publicKey);
  return { publicKey, privateKeyBytes: kp.rawSecretKey(), keyId };
}

export async function keyIdFrom(publicKey: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(publicKey));
  return Buffer.from(hash).toString("hex").slice(0, 16);
}
