import { afterEach, describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { startServer } from "../src/server.js";

describe("server integration", () => {
  let closeServer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  it("serves the MCP endpoint and exposes the Synod tools", async () => {
    const started = await startServer({ port: 0, installSignalHandlers: false });
    closeServer = started.close;

    const healthResponse = await fetch(`http://127.0.0.1:${started.port}/health`);
    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({ ok: true, ws: "disconnected" });

    const client = new Client({ name: "synod-test-client", version: "1.0.0" }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${started.port}/mcp`));

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "initialize_identity",
      "poll_registration_status",
      "connect_to_synod",
      "submit_intent",
      "get_policy",
      "get_connection_status",
      "get_recent_events",
    ]));

    const status = await client.callTool({ name: "get_connection_status", arguments: {} });
    expect(status.content[0]?.type).toBe("text");

    const parsed = JSON.parse((status.content[0] as { type: "text"; text: string }).text) as {
      ws_status: string;
      message: string;
    };

    expect(parsed.ws_status).toBe("disconnected");
    expect(parsed.message).toContain("Not connected");

    await client.close();
  });
});
