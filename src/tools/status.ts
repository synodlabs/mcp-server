/**
 * tools/status.ts — get_connection_status tool
 */

import { synodWs }   from "../transport/websocket.js";
import { getIdentity } from "./identity.js";

export function getConnectionStatus(): {
  ws_status:    string;
  connected_at: string | null;
  public_key:   string | null;
  storage_type: string | null;
  last_event_at: string | null;
  last_error: string | null;
  message:      string;
} {
  const identity = getIdentity();
  const connAt   = synodWs.connectedAt;
  const lastEventAt = synodWs.lastEventAt;
  return {
    ws_status:    synodWs.status,
    connected_at: connAt ? new Date(connAt).toISOString() : null,
    public_key:   identity?.publicKey ?? null,
    storage_type: identity?.storageType ?? null,
    last_event_at: lastEventAt ? new Date(lastEventAt).toISOString() : null,
    last_error: synodWs.lastError,
    message:      synodWs.status === "connected"
      ? `Connected to Synod since ${new Date(connAt!).toISOString()}.`
      : synodWs.status === "connecting"
        ? "Connecting to Synod. Reconnect is in progress."
        : "Not connected to Synod. Call connect_to_synod.",
  };
}
