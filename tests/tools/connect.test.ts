import { beforeEach, describe, expect, it, vi } from "vitest";

const synodHttpMock = vi.hoisted(() => ({
  connectStatus: vi.fn(),
  connectInit: vi.fn(),
  connectComplete: vi.fn(),
}));

const synodWsMock = vi.hoisted(() => ({
  status: "disconnected" as "disconnected" | "connecting" | "connected",
  lastError: null as string | null,
  connect: vi.fn((_: string, options?: { refreshTicket?: () => Promise<string> }) => {
    synodWsMock.status = "connected";
    synodWsMock.lastConnectOptions = options;
  }),
  destroy: vi.fn(() => {
    synodWsMock.status = "disconnected";
  }),
  clearRecentEvents: vi.fn(),
  lastConnectOptions: undefined as { refreshTicket?: () => Promise<string> } | undefined,
}));

const identityMock = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock("../../src/transport/http.js", () => ({ synodHttp: synodHttpMock }));
vi.mock("../../src/transport/websocket.js", () => ({ synodWs: synodWsMock }));
vi.mock("../../src/tools/identity.js", () => identityMock);

import { connectToSynod, pollRegistrationStatus, resetConnectionState } from "../../src/tools/connect.js";

describe("connect tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    synodWsMock.status = "disconnected";
    synodWsMock.lastError = null;
    synodWsMock.lastConnectOptions = undefined;
    resetConnectionState();
  });

  it("requires registration polling for a new identity", async () => {
    identityMock.getIdentity.mockReturnValue({
      publicKey: "GNEW",
      keyId: "k1",
      existed: false,
      storageType: "encrypted_store",
    });

    await expect(connectToSynod()).resolves.toEqual({
      success: false,
      message: "This identity has not been confirmed by Synod yet. Call poll_registration_status until it returns ready, then retry connect_to_synod.",
    });
  });

  it("polls until ready and then connects with a refresh callback", async () => {
    const signChallenge = vi.fn().mockResolvedValue({ signature: "sig", publicKey: "GREADY" });

    identityMock.getIdentity.mockReturnValue({
      publicKey: "GREADY",
      keyId: "k1",
      existed: false,
      storageType: "encrypted_store",
    });
    identityMock.getProvider.mockReturnValue({ signChallenge });

    synodHttpMock.connectStatus.mockResolvedValue({ status: "ready" });
    synodHttpMock.connectInit.mockResolvedValue({ nonce: "nonce-1", expires_at: Date.now() + 30_000 });
    synodHttpMock.connectComplete.mockResolvedValue({ ws_ticket: "ticket-1", agent_id: "agent-1" });

    await expect(pollRegistrationStatus()).resolves.toEqual({
      status: "ready",
      message: "Agent slot is ready. You can now call connect_to_synod.",
    });

    const result = await connectToSynod();
    expect(result).toEqual({
      success: true,
      agent_id: "agent-1",
      message: "Connected to Synod. Agent ID: agent-1. WebSocket open. You are ready to submit intents.",
    });

    expect(synodWsMock.connect).toHaveBeenCalledWith(
      "ticket-1",
      expect.objectContaining({ refreshTicket: expect.any(Function) }),
    );

    const refreshTicket = synodWsMock.lastConnectOptions?.refreshTicket;
    expect(refreshTicket).toBeTypeOf("function");

    synodHttpMock.connectInit.mockResolvedValueOnce({ nonce: "nonce-2", expires_at: Date.now() + 30_000 });
    synodHttpMock.connectComplete.mockResolvedValueOnce({ ws_ticket: "ticket-2", agent_id: "agent-1" });

    await expect(refreshTicket?.()).resolves.toBe("ticket-2");
    expect(signChallenge).toHaveBeenCalledTimes(2);
  });

  it("returns a user-facing error when polling fails", async () => {
    identityMock.getIdentity.mockReturnValue({
      publicKey: "GBAD",
      keyId: "k1",
      existed: false,
      storageType: "encrypted_store",
    });
    synodHttpMock.connectStatus.mockRejectedValue(new Error("network down"));

    await expect(pollRegistrationStatus()).resolves.toEqual({
      status: "error",
      message: "Failed to poll registration status. network down",
    });
  });
});
