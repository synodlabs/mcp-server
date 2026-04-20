/**
 * config.ts — Synod platform constants
 */

const DEFAULT_BASE_URL = "https://synod-backend-ddgj.onrender.com";
const baseUrl = (process.env["SYNOD_BASE_URL"] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
const stellarNetwork = (process.env["SYNOD_STELLAR_NETWORK"] ?? "testnet").trim().toLowerCase();

export const SYNOD_BASE_URL = baseUrl;
export const SYNOD_WS_URL = process.env["SYNOD_WS_URL"] ?? `${baseUrl.replace(/^http/i, "ws")}/agent/ws`;
export const SYNOD_SKILL_URL = process.env["SYNOD_SKILL_URL"] ?? `${baseUrl}/skill/synod.md`;
export const SYNOD_STELLAR_NETWORK = stellarNetwork;
export const SYNOD_STELLAR_NETWORK_PASSPHRASE =
  process.env["SYNOD_STELLAR_NETWORK_PASSPHRASE"]
  ?? (stellarNetwork === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015");
export const SYNOD_HORIZON_URL =
  process.env["SYNOD_HORIZON_URL"]
  ?? (stellarNetwork === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org");

export const ENDPOINTS = {
  connectInit:     `${SYNOD_BASE_URL}/connect/init`,
  connectComplete: `${SYNOD_BASE_URL}/connect/complete`,
  connectStatus:   `${SYNOD_BASE_URL}/connect/status`,
  register:        `${SYNOD_BASE_URL}/agents/register`,
  intents:         `${SYNOD_BASE_URL}/intents/submit`,
  policy:          `${SYNOD_BASE_URL}/policy`,
} as const;

// WebSocket heartbeat interval (ms)
export const WS_PING_INTERVAL_MS = 30_000;
// WebSocket reconnect backoff base (ms)
export const WS_RECONNECT_BASE_MS = 2_000;
// Max reconnect backoff (ms)
export const WS_RECONNECT_MAX_MS = 30_000;
// Challenge expiry window (ms) — reject challenges older than this locally
export const CHALLENGE_MAX_AGE_MS = 120_000;
// Status poll interval (ms)
export const POLL_INTERVAL_MS = 5_000;
// Status poll max attempts before giving up
export const POLL_MAX_ATTEMPTS = 36; // 3 minutes total
