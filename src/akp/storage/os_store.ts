const SERVICE = "synod-akp";
const ACCOUNT = "agent-private-key";

export interface OsStore {
  type: "os_store";
  get(): Promise<Uint8Array | null>;
  set(b: Uint8Array): Promise<boolean>;
  clear(): Promise<void>;
}

export async function tryOSStore(): Promise<OsStore | null> {
  let kt: typeof import("keytar") | null = null;
  try { kt = await import("keytar"); } catch { return null; }
  try { await kt.findPassword(SERVICE); } catch { return null; }

  return {
    type: "os_store",
    async get() {
      try {
        const r = await kt!.getPassword(SERVICE, ACCOUNT);
        return r ? new Uint8Array(Buffer.from(r, "base64")) : null;
      } catch { return null; }
    },
    async set(b) {
      try { await kt!.setPassword(SERVICE, ACCOUNT, Buffer.from(b).toString("base64")); return true; }
      catch { return false; }
    },
    async clear() {
      try { await kt!.deletePassword(SERVICE, ACCOUNT); } catch { /* ignore */ }
    },
  };
}
