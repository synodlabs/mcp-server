import { tryOSStore }     from "./os_store.js";
import { encryptedStore } from "./encrypted_store.js";
import { memoryStore }    from "./memory_store.js";
import { getMachineId }   from "./machine_id.js";

export type StorageType = "os_store" | "encrypted_store" | "memory_store";

export interface ResolvedStorage {
  type: StorageType;
  load(): Promise<Uint8Array | null>;
  save(b: Uint8Array, meta: { publicKey: string; keyId: string }): Promise<void>;
  clear(): Promise<void>;
}

export async function resolveStorage(): Promise<ResolvedStorage> {
  const machineId = await getMachineId();

  const os = await tryOSStore();
  if (os) return {
    type: "os_store",
    async load()         { return os.get(); },
    async save(b)        { if (!await os.set(b)) throw new Error("AKP: OS store write failed"); },
    async clear()        { await os.clear(); },
  };

  const enc = encryptedStore();
  return {
    type: "encrypted_store",
    async load()         { return enc.get(machineId); },
    async save(b, meta)  { if (!await enc.set(b, machineId, meta)) throw new Error("AKP: Encrypted store write failed"); },
    async clear()        { await enc.clear(); },
  };
}

export function memoryFallback(): ResolvedStorage {
  const mem = memoryStore();
  return {
    type: "memory_store",
    async load()        { return mem.get(); },
    async save(b)       { mem.set(b); },
    async clear()       { mem.clear(); },
  };
}
