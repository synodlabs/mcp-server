#!/usr/bin/env node
/**
 * @synod/mcp-server — entry point
 * Run with: npx @synod/mcp-server
 */

import { startServer } from "./server.js";

startServer().catch((err) => {
  console.error("Failed to start Synod MCP Server:", err);
  process.exit(1);
});
