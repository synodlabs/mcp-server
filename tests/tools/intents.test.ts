import { beforeEach, describe, expect, it, vi } from "vitest";

const synodHttpMock = vi.hoisted(() => ({
  submitIntent: vi.fn(),
}));

const synodWsMock = vi.hoisted(() => ({
  status: "disconnected" as "disconnected" | "connecting" | "connected",
}));

const identityMock = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock("../../src/transport/http.js", () => ({ synodHttp: synodHttpMock }));
vi.mock("../../src/transport/websocket.js", () => ({ synodWs: synodWsMock }));
vi.mock("../../src/tools/identity.js", () => identityMock);

import { submitIntent } from "../../src/tools/intents.js";

describe("submitIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    synodWsMock.status = "disconnected";
  });

  it("requires identity initialization before submitting", async () => {
    identityMock.getIdentity.mockReturnValue(null);

    await expect(submitIntent({ type: "payment" })).resolves.toEqual({
      success: false,
      message: "Call initialize_identity first.",
    });
  });

  it("validates intent requirements and canonicalizes the signed payload", async () => {
    const sign = vi.fn().mockResolvedValue({ signature: "sig", publicKey: "GPUB" });

    identityMock.getIdentity.mockReturnValue({
      publicKey: "GPUB",
      keyId: "kid",
      existed: true,
      storageType: "encrypted_store",
    });
    identityMock.getProvider.mockReturnValue({ sign });
    synodWsMock.status = "connected";
    synodHttpMock.submitIntent.mockResolvedValue({
      intent_id: "intent-1",
      status: "executed",
      tx_hash: "tx-1",
    });

    const result = await submitIntent({
      type: "payment",
      destination: "GDEST",
      amount: "10",
      asset: "XLM",
      memo: "hello",
    });

    expect(result).toEqual({
      success: true,
      intent_id: "intent-1",
      status: "executed",
      tx_hash: "tx-1",
      message: "Intent submitted. ID: intent-1. Status: executed. Tx: tx-1",
    });

    const payload = new TextDecoder().decode(sign.mock.calls[0][0]);
    expect(payload).toBe("{\"amount\":\"10\",\"asset\":\"XLM\",\"memo\":\"hello\",\"to\":\"GDEST\",\"type\":\"payment\"}");
    expect(synodHttpMock.submitIntent).toHaveBeenCalledWith(
      {
        intent: {
          type: "payment",
          to: "GDEST",
          amount: "10",
          asset: "XLM",
          memo: "hello",
        },
        signature: "sig",
        public_key: "GPUB",
      },
      expect.any(String),
    );
  });

  it("rejects invalid payment intents before signing", async () => {
    identityMock.getIdentity.mockReturnValue({
      publicKey: "GPUB",
      keyId: "kid",
      existed: true,
      storageType: "encrypted_store",
    });
    synodWsMock.status = "connected";

    const result = await submitIntent({
      type: "payment",
      amount: "10",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("requires 'to' or 'destination'");
  });
});
