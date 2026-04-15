/**
 * server.ts â€” MCP Server bootstrap
 * Registers all tools and starts the server over HTTP transport.
 */

import { createServer, type Server as HttpServer } from "http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";

import { getErrorMessage } from "./lib/errors.js";
import { connectToSynod, pollRegistrationStatus } from "./tools/connect.js";
import { getRecentEvents } from "./tools/events.js";
import { initializeIdentity } from "./tools/identity.js";
import { submitIntent } from "./tools/intents.js";
import { getPolicy } from "./tools/policy.js";
import { getConnectionStatus } from "./tools/status.js";
import { synodWs } from "./transport/websocket.js";

const PORT = parseInt(process.env["SYNOD_MCP_PORT"] ?? "3666", 10);

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "synod-mcp",
    version: "1.0.0",
  });

  server.tool(
    "initialize_identity",
    "Boot the Agent Key Provider. Loads existing Ed25519 keypair or generates a new one. Always call this first on every boot.",
    {},
    async () => {
      const result = await initializeIdentity();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "poll_registration_status",
    "Poll Synod until the agent slot created from your public key is ready. Polls every 5 seconds, up to 2 minutes.",
    {},
    async () => {
      const result = await pollRegistrationStatus();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "connect_to_synod",
    "Run the full Synod connection handshake and open the persistent authenticated WebSocket.",
    {},
    async () => {
      const result = await connectToSynod();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "submit_intent",
    "Sign and submit an intent to Synod for policy validation and on-chain execution.",
    {
      intent: z.object({
        type: z.string().describe("Intent type e.g. 'payment', 'swap', 'delegate'"),
        to: z.string().optional().describe("Destination Stellar address"),
        destination: z.string().optional().describe("Alias for 'to'"),
        amount: z.string().optional().describe("Amount as a string e.g. '10.5'"),
        asset: z.string().optional().describe("Asset code e.g. 'XLM', 'USDC'"),
        memo: z.string().optional().describe("Optional memo"),
        from_asset: z.string().optional().describe("Swap source asset"),
        to_asset: z.string().optional().describe("Swap destination asset"),
      }).catchall(z.unknown()).describe("The intent object to sign and submit"),
    },
    async ({ intent }) => {
      const result = await submitIntent(intent);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_policy",
    "Fetch this agent's active policy from Synod.",
    {},
    async () => {
      const result = await getPolicy();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_connection_status",
    "Check current connection health: WebSocket status, public key, storage backend, connected since, and any recent socket errors.",
    {},
    async () => {
      const result = getConnectionStatus();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_recent_events",
    "Return the most recent Synod WebSocket events observed by this MCP server process.",
    {
      limit: z.number().int().positive().max(100).optional().describe("Maximum number of events to return"),
    },
    async ({ limit }) => {
      const result = getRecentEvents(limit);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}

export async function startServer(options: {
  port?: number;
  installSignalHandlers?: boolean;
} = {}): Promise<{
  port: number;
  server: HttpServer;
  close: () => Promise<void>;
}> {
  const port = options.port ?? PORT;

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ws: synodWs.status }));
      return;
    }

    if (url.pathname !== "/" && url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport();

    try {
      // SDK 1.29.0's StreamableHTTP transport has a typing mismatch under exactOptionalPropertyTypes.
      await server.connect(transport as Transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: getErrorMessage(error, "Internal server error"),
          },
          id: null,
        }));
      }
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      resolve();
    });
  });

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  console.log(`Synod MCP Server running on http://localhost:${actualPort}`);
  console.log(`MCP endpoint: http://localhost:${actualPort}/mcp`);
  console.log(`Health: http://localhost:${actualPort}/health`);

  const close = async (): Promise<void> => {
    synodWs.destroy();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  };

  if (options.installSignalHandlers ?? true) {
    const shutdown = () => {
      void close().finally(() => process.exit(0));
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }

  return { port: actualPort, server: httpServer, close };
}
