import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("encryptedStore", () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  let tempHome = "";

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "synod-mcp-tests-"));
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;
    vi.resetModules();
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;

    if (tempHome) {
      await rm(tempHome, { recursive: true, force: true });
    }
  });

  it("persists encrypted key material and decrypts it with the same machine id", async () => {
    const { encryptedStore } = await import("../../src/akp/storage/encrypted_store.js");

    const store = encryptedStore();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await expect(store.set(bytes, "machine-a", { publicKey: "GPUB", keyId: "kid" })).resolves.toBe(true);

    const raw = await readFile(join(tempHome, ".synod", "akp.json"), "utf8");
    expect(raw).toContain("\"ciphertext\"");
    expect(raw).not.toContain("AQIDBA==");

    await expect(store.get("machine-a")).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
    await expect(store.get("machine-b")).resolves.toBeNull();

    await store.clear();
    await expect(store.get("machine-a")).resolves.toBeNull();
  });
});
