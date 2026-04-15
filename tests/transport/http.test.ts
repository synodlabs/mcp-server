import { describe, expect, it, vi } from "vitest";

import { createSynodHttp, SynodHttpError } from "../../src/transport/http.js";

describe("createSynodHttp", () => {
  it("returns parsed JSON on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ nonce: "abc", expires_at: 123 }),
    });

    const http = createSynodHttp(fetchMock as typeof fetch);
    await expect(http.connectInit({ public_key: "G123" }, "https://synod.example")).resolves.toEqual({
      nonce: "abc",
      expires_at: 123,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://synod.example/connect/init",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces structured Synod errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: vi.fn().mockResolvedValue({ message: "denied" }),
    });

    const http = createSynodHttp(fetchMock as typeof fetch);

    await expect(http.getPolicy("G123", "https://synod.example")).rejects.toEqual(
      expect.objectContaining({
        name: "SynodHttpError",
        status: 403,
        message: "Synod HTTP 403: denied",
      }),
    );
  });

  it("throws when the response body is not valid JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });

    const http = createSynodHttp(fetchMock as typeof fetch);

    await expect(http.connectStatus("G123", "https://synod.example")).rejects.toEqual(
      expect.objectContaining({
        name: "SynodHttpError",
        status: 200,
        message: "Synod HTTP 200: bad json",
      }),
    );
    await expect(http.connectStatus("G123", "https://synod.example")).rejects.toBeInstanceOf(SynodHttpError);
  });
});
