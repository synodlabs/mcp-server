import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

import { SynodWebSocket } from "../../src/transport/websocket.js";
import { waitFor } from "../helpers/wait.js";

describe("SynodWebSocket", () => {
  let server: WebSocketServer | null = null;
  let client: SynodWebSocket | null = null;

  afterEach(async () => {
    client?.destroy();
    client = null;

    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }

      server.close(() => resolve());
      server = null;
    });
  });

  it("reconnects with a freshly issued ticket and stores recent events", async () => {
    const tickets: string[] = [];
    let connectionCount = 0;

    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server!.once("listening", () => resolve()));

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    server.on("connection", (socket, request) => {
      connectionCount += 1;
      const url = new URL(request.url ?? "/", "ws://localhost");
      const ticket = url.searchParams.get("ticket") ?? "";
      tickets.push(ticket);

      socket.send(JSON.stringify({ type: "connected", ticket, connection: connectionCount }));

      if (connectionCount === 1) {
        setTimeout(() => socket.close(), 25);
      }
    });

    const ws = new SynodWebSocket({
      wsUrl: `ws://127.0.0.1:${address.port}`,
      pingIntervalMs: 10,
      reconnectBaseMs: 20,
      reconnectMaxMs: 20,
    });
    client = ws;

    ws.connect("ticket-1", {
      refreshTicket: async () => "ticket-2",
    });

    await waitFor(() => tickets.length >= 2, { timeoutMs: 3_000 });
    await waitFor(() => ws.status === "connected", { timeoutMs: 3_000 });

    expect(tickets).toEqual(["ticket-1", "ticket-2"]);
    expect(ws.status).toBe("connected");
    expect(ws.getRecentEvents(10).map((entry) => entry.event.type)).toContain("connected");
    expect(ws.lastEventAt).not.toBeNull();

    ws.destroy();
    client = null;
  });

  it("sends application-level ping messages on the heartbeat interval", async () => {
    let pingCount = 0;

    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server!.once("listening", () => resolve()));

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    server.on("connection", (socket) => {
      socket.on("message", (raw) => {
        if (raw.toString() === "ping") {
          pingCount += 1;
        }
      });
    });

    const ws = new SynodWebSocket({
      wsUrl: `ws://127.0.0.1:${address.port}`,
      pingIntervalMs: 10,
      reconnectBaseMs: 20,
      reconnectMaxMs: 20,
    });
    client = ws;

    ws.connect("ticket-1");

    await waitFor(() => pingCount > 0, { timeoutMs: 3_000 });
    expect(pingCount).toBeGreaterThan(0);
  });
});
