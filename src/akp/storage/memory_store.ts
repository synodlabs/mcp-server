let _stored: Uint8Array | null = null;

export interface MemoryStore {
  type: "memory_store";
  get(): Uint8Array | null;
  set(b: Uint8Array): void;
  clear(): void;
}

export function memoryStore(): MemoryStore {
  return {
    type: "memory_store",
    get()         { return _stored ? new Uint8Array(_stored) : null; },
    set(b)        { _stored = new Uint8Array(b); },
    clear()       { _stored?.fill(0); _stored = null; },
  };
}
