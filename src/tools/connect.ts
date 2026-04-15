/**
 * tools/connect.ts â€” Synod connection tools
 *
 * poll_registration_status : Phase 5 bridge â€” polls until slot is ready
 * connect_to_synod         : Phases 6â€“10 â€” full challenge/response handshake
 */

import { SYNOD_BASE_URL, POLL_INTERVAL_MS, POLL_MAX_ATTEMPTS, CHALLENGE_MAX_AGE_MS } from "../config.js";
import { getErrorMessage } from "../lib/errors.js";
import { synodHttp } from "../transport/http.js";
import { synodWs } from "../transport/websocket.js";
import { getIdentity, getProvider } from "./identity.js";

let registrationReadyForPublicKey: string | null = null;

export async function pollRegistrationStatus(): Promise<{
  status: string;
  message: string;
}> {
  const identity = getIdentity();
  if (!identity) {
    return { status: "error", message: "Call initialize_identity first." };
  }

  try {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const response = await synodHttp.connectStatus(identity.publicKey, SYNOD_BASE_URL);

      if (response.status === "ready") {
        registrationReadyForPublicKey = identity.publicKey;
        return {
          status: "ready",
          message: "Agent slot is ready. You can now call connect_to_synod.",
        };
      }

      if (response.status === "not_found") {
        return {
          status: "not_found",
          message: "Public key not found in Synod. Make sure you have pasted the correct public key into the Synod dashboard and clicked Done.",
        };
      }

      await sleep(POLL_INTERVAL_MS);
    }
  } catch (error) {
    return {
      status: "error",
      message: `Failed to poll registration status. ${getErrorMessage(error, "Unknown Synod error.")}`,
    };
  }

  return {
    status: "timeout",
    message: `Agent slot is still pending after ${POLL_MAX_ATTEMPTS} attempts over 3 minutes. Finish the dashboard flow, then tell me "continue" when you are done and I will poll again.`,
  };
}

export async function connectToSynod(): Promise<{
  success: boolean;
  agent_id?: string;
  message: string;
}> {
  const identity = getIdentity();
  if (!identity) {
    return { success: false, message: "Call initialize_identity first." };
  }

  if (!identity.existed && registrationReadyForPublicKey !== identity.publicKey) {
    return {
      success: false,
      message: "This identity has not been confirmed by Synod yet. Call poll_registration_status until it returns ready, then retry connect_to_synod.",
    };
  }

  try {
    const provider = getProvider();
    const session = await issueSession(identity.publicKey, provider);

    synodWs.connect(session.ws_ticket, {
      refreshTicket: async () => {
        const refreshed = await issueSession(identity.publicKey, provider);
        return refreshed.ws_ticket;
      },
    });

    const connected = await waitForWsOpen(3_000);
    if (!connected) {
      return {
        success: false,
        message: `Synod handshake succeeded, but the WebSocket did not open in time.${synodWs.lastError ? ` ${synodWs.lastError}` : ""}`,
      };
    }

    registrationReadyForPublicKey = identity.publicKey;
    return {
      success: true,
      agent_id: session.agent_id,
      message: `Connected to Synod. Agent ID: ${session.agent_id}. WebSocket open. You are ready to submit intents.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to connect to Synod. ${getErrorMessage(error, "Unknown Synod error.")}`,
    };
  }
}

export function resetConnectionState(): void {
  registrationReadyForPublicKey = null;
  synodWs.destroy();
  synodWs.clearRecentEvents();
}

async function issueSession(
  publicKey: string,
  provider: ReturnType<typeof getProvider>,
): Promise<{ ws_ticket: string; agent_id: string }> {
  const { nonce, expires_at } = await synodHttp.connectInit(
    { public_key: publicKey },
    SYNOD_BASE_URL
  );

  const now = Date.now();
  if (expires_at <= now) {
    throw new Error("Challenge expired before signing. Try again.");
  }

  if (expires_at - now > CHALLENGE_MAX_AGE_MS) {
    throw new Error("Challenge expiry from Synod is outside the allowed window.");
  }

  const { signature } = await provider.signChallenge(nonce);

  return synodHttp.connectComplete(
    { public_key: publicKey, signature, nonce },
    SYNOD_BASE_URL
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForWsOpen(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (synodWs.status === "connected") {
      resolve(true);
      return;
    }

    const deadline = setTimeout(() => {
      clearInterval(check);
      resolve(false);
    }, timeoutMs);

    const check = setInterval(() => {
      if (synodWs.status === "connected") {
        clearTimeout(deadline);
        clearInterval(check);
        resolve(true);
      }
    }, 100);
  });
}
