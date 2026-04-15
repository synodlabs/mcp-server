import { deriveKey, randomSalt } from "../crypto/kdf.js";
import { encrypt, decrypt }      from "../crypto/aes.js";
import { akpDir, akpPath }       from "./paths.js";

interface Blob {
  ciphertext: string; iv: string; salt: string;
  publicKey: string;  keyId: string;
  createdAt: number;  storageType: "encrypted";
}

export interface EncryptedStore {
  type: "encrypted_store";
  get(machineId: string): Promise<Uint8Array | null>;
  set(b: Uint8Array, machineId: string, meta: { publicKey: string; keyId: string }): Promise<boolean>;
  clear(): Promise<void>;
}

export function encryptedStore(): EncryptedStore {
  return {
    type: "encrypted_store",

    async get(machineId) {
      try {
        const { readFile } = await import("fs/promises");
        const raw: Blob = JSON.parse(await readFile(akpPath(), "utf8"));
        const salt = new Uint8Array(Buffer.from(raw.salt, "base64"));
        const key  = await deriveKey(machineId, salt);
        return await decrypt({ ciphertext: raw.ciphertext, iv: raw.iv }, key);
      } catch { return null; }
    },

    async set(bytes, machineId, meta) {
      try {
        const { writeFile, mkdir } = await import("fs/promises");
        const salt = randomSalt();
        const key  = await deriveKey(machineId, salt);
        const { ciphertext, iv } = await encrypt(bytes, key);
        const blob: Blob = {
          ciphertext, iv,
          salt: Buffer.from(salt).toString("base64"),
          publicKey: meta.publicKey, keyId: meta.keyId,
          createdAt: Date.now(), storageType: "encrypted",
        };
        await mkdir(akpDir(), { recursive: true });
        await writeFile(akpPath(), JSON.stringify(blob, null, 2), "utf8");
        return true;
      } catch { return false; }
    },

    async clear() {
      try { const { unlink } = await import("fs/promises"); await unlink(akpPath()); }
      catch { /* ignore */ }
    },
  };
}
