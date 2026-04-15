import { beforeEach, describe, expect, it, vi } from "vitest";

describe("KeyProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to in-memory storage when the primary storage fails", async () => {
    vi.resetModules();

    const memoryBytes: Uint8Array[] = [];

    vi.doMock("../../src/akp/storage/resolve.js", () => ({
      resolveStorage: vi.fn().mockRejectedValue(new Error("primary storage unavailable")),
      memoryFallback: () => ({
        type: "memory_store",
        load: async () => memoryBytes[0] ? new Uint8Array(memoryBytes[0]) : null,
        save: async (bytes: Uint8Array) => { memoryBytes[0] = new Uint8Array(bytes); },
        clear: async () => { memoryBytes[0] = new Uint8Array(); },
      }),
    }));

    const { KeyProvider } = await import("../../src/akp/index.js");
    const { provider, identity } = await KeyProvider.init();

    expect(identity.storageType).toBe("memory_store");
    expect(identity.existed).toBe(false);

    const signature = await provider.signText("hello");
    expect(typeof signature.signature).toBe("string");
    expect(signature.publicKey).toBe(identity.publicKey);
  });

  it("loads an existing key from the resolved storage", async () => {
    vi.resetModules();

    const { generateKeypair } = await import("../../src/akp/core/keygen.js");
    const material = await generateKeypair();

    vi.doMock("../../src/akp/storage/resolve.js", () => ({
      resolveStorage: vi.fn().mockResolvedValue({
        type: "encrypted_store",
        load: async () => new Uint8Array(material.privateKeyBytes),
        save: async () => undefined,
        clear: async () => undefined,
      }),
      memoryFallback: vi.fn(),
    }));

    const { KeyProvider } = await import("../../src/akp/index.js");
    const { provider, identity } = await KeyProvider.init();

    expect(identity.existed).toBe(true);
    expect(identity.publicKey).toBe(material.publicKey);

    const payload = new TextEncoder().encode("hello");
    const signed = await provider.sign(payload);
    expect(provider.verify(payload, signed.signature)).toBe(true);
  });
});
