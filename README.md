# @synod/mcp-server

> The official Synod MCP Server. Gives any AI agent a persistent Ed25519 identity, an authenticated Synod connection, and typed tools for policy-governed on-chain actions.

---

## What it does

When an agent installs and runs this server it gets:

- **Persistent cryptographic identity** — Ed25519 keypair generated once and stored on the machine
- **Authenticated Synod connection** — challenge/response handshake plus persistent WebSocket
- **Typed MCP tools** — `initialize_identity`, `poll_registration_status`, `connect_to_synod`, `submit_intent`, `get_policy`, `get_connection_status`, `get_recent_events`
- **Zero private key exposure** — private key never leaves the MCP server process

The agent calls tools. All cryptography, HTTP, and WebSocket logic stays inside the MCP server.

---

## Installation

```bash
npx @synod/mcp-server
```

The server starts on `http://localhost:3666` by default. The MCP endpoint is `http://localhost:3666/mcp`.

To install globally:

```bash
npm install -g @synod/mcp-server
synod-mcp
```

Custom port:

```bash
SYNOD_MCP_PORT=4000 npx @synod/mcp-server
```

---

## Prerequisites

- Node.js >= 18
- Optional `keytar` for OS keychain storage: `npm install -g keytar`

---

## Transport

This package currently exposes MCP over **Streamable HTTP**.

Use it with any HTTP-capable MCP client:

```text
MCP Server URL: http://localhost:3666/mcp
```

---

## Agent setup

### Step 1 — Run the server

```bash
npx @synod/mcp-server
# Synod MCP Server running on http://localhost:3666
# MCP endpoint: http://localhost:3666/mcp
```

### Step 2 — Initialize identity

Call:

```text
initialize_identity()
```

This returns your public key.

### Step 3 — Bind agent in the Synod dashboard

1. Go to `https://synodai.xyz`
2. Click **Add Agent Slot**
3. Enter an agent name
4. Paste your public key
5. Click **Done**

### Step 4 — Poll until ready

Call:

```text
poll_registration_status()
```

It polls every 5 seconds for up to 3 minutes and returns `ready` when the slot is confirmed.

### Step 5 — Connect

Call:

```text
connect_to_synod()
```

This runs the full challenge/response handshake and opens the authenticated WebSocket to Synod.

### Step 6 — Act

```text
submit_intent({ type: "payment", to: "G...", amount: "10", asset: "XLM" })
get_policy()
get_connection_status()
get_recent_events()
```

---

## Tools

### `initialize_identity`

Boots the Agent Key Provider. Loads an existing keypair from storage or generates a new one.

Returns:

```json
{
  "public_key": "GXXXXX...",
  "key_id": "a3f8b21c94e10000",
  "existed": false,
  "storage_type": "os_store | encrypted_store | memory_store",
  "message": "New identity generated..."
}
```

### `poll_registration_status`

Polls `GET /connect/status` until the agent slot is ready.

Returns:

```json
{ "status": "ready", "message": "Agent slot is ready..." }
```

### `connect_to_synod`

Handshake flow:

1. `POST /connect/init` -> receives nonce
2. Signs `SHA256(canonical_json({ action, domain, nonce }))` with Ed25519
3. `POST /connect/complete` -> receives `ws_ticket`
4. Opens persistent WebSocket to `wss://synodai.xyz/agent/ws`

Returns:

```json
{ "success": true, "agent_id": "...", "message": "Connected to Synod..." }
```

### `submit_intent`

Signs and submits an intent. Requires an active Synod connection.

Parameters:

```json
{
  "intent": {
    "type": "payment",
    "to": "GDESTINATION...",
    "amount": "10",
    "asset": "XLM",
    "memo": "optional"
  }
}
```

Returns:

```json
{ "success": true, "intent_id": "...", "tx_hash": "...", "status": "..." }
```

### `get_policy`

Fetches this agent's active policy rules from Synod.

### `get_connection_status`

Returns current WebSocket health, public key, storage type, connected since, last event time, and last socket error.

### `get_recent_events`

Returns the most recent Synod WebSocket events seen by this MCP server process. This is useful for HTTP MCP clients that cannot receive pushed socket events directly.

---

## Storage backends

The internal AKP module automatically selects the best available storage:

| Backend | Location | Security | Persistence |
|---|---|---|---|
| `os_store` | macOS Keychain / Windows Credential Manager | Strongest | Yes |
| `encrypted_store` | `~/.synod/akp.json` (AES-256-GCM) | Strong | Yes |
| `memory_store` | Process memory | Ephemeral | No |

If `memory_store` is active, the agent must re-register with Synod on every boot.

---

## WebSocket behavior

- Opens after successful `connect_to_synod()`
- Sends ping frames every 30 seconds
- Auto-reconnects on drop with exponential backoff
- Re-runs `/connect/init` -> `/connect/complete` before reconnecting so a fresh `ws_ticket` is always used
- Stores recent pushed events so MCP clients can inspect them with `get_recent_events()`

---

## Security

- Private key never leaves the MCP server process
- AES-256-GCM encryption at rest for `encrypted_store`
- PBKDF2-SHA256 with 210,000 iterations for key derivation
- Challenge signing uses canonical JSON -> SHA-256 -> Ed25519
- `ws_ticket` is short-lived and refreshed for reconnect
- Private key bytes are zeroed after each sign operation

---

## Publishing to npm

```bash
npm run build
npm test
node dist/index.js
npm login
npm publish --access public
```

---

## Publishing to Smithery

```yaml
name: synod-mcp
description: Synod agent identity and policy MCP server
runtime: node
command: npx @synod/mcp-server
transport: http
port: 3666
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `SYNOD_MCP_PORT` | `3666` | HTTP server port |
| `SYNOD_BASE_URL` | `https://synodai.xyz` | Synod API base URL |
| `SYNOD_WS_URL` | derived from `SYNOD_BASE_URL` | Synod WebSocket URL |
| `SYNOD_SKILL_URL` | `${SYNOD_BASE_URL}/skill/synod.md` | Published Synod skill URL |
| `SYNOD_AKP_STORAGE` | `auto` | Force AKP storage backend: `auto`, `os_store`, `encrypted_store`, or `memory_store` |

---

## Health check

```bash
curl http://localhost:3666/health
# {"ok":true,"ws":"connected"}
```

---

## License

MIT
