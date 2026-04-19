/**
 * http.ts â€” Typed Synod HTTP client
 * All Synod API calls go through here. Never call fetch() directly in tools.
 */

import { getErrorMessage } from "../lib/errors.js";

export class SynodHttpError extends Error {
  constructor(public status: number, message: string) {
    super(`Synod HTTP ${status}: ${message}`);
    this.name = "SynodHttpError";
  }
}

type FetchLike = typeof fetch;

async function request<T>(fetchImpl: FetchLike, url: string, options?: RequestInit): Promise<T> {
  const res = await fetchImpl(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });

  if (!res.ok) {
    let message = res.statusText;

    try {
      const body = await res.json() as { message?: unknown; error?: unknown };
      if (typeof body.message === "string" && body.message.trim()) {
        message = body.message;
      } else if (typeof body.error === "string" && body.error.trim()) {
        message = body.error;
      }
    } catch {
      // Ignore non-JSON error bodies and fall back to the HTTP status text.
    }

    throw new SynodHttpError(res.status, message);
  }

  try {
    return await res.json() as T;
  } catch (error) {
    throw new SynodHttpError(res.status, getErrorMessage(error, "Synod returned invalid JSON."));
  }
}

export interface ConnectInitRequest { public_key: string; }
export interface ConnectInitResponse { nonce: string; expires_at: number; }

export interface ConnectCompleteRequest { public_key: string; signature: string; nonce: string; }
export interface ConnectCompleteResponse { ws_ticket: string; agent_id: string; }

export interface ConnectStatusResponse { status: "pending" | "ready" | "not_found"; }

export interface SubmitIntentRequest { intent: unknown; signature: string; public_key: string; }
export interface SubmitIntentResponse {
  intent_id: string;
  status: string;
  tx_hash?: string;
  reason?: string;
}

export interface PolicyResponse {
  agent_id: string;
  public_key: string;
  rules: PolicyRule[];
  created_at: number;
  updated_at: number;
}

export interface PolicyRule {
  type: string;
  asset?: string;
  max_amount?: string;
  allowed_destinations?: string[];
  [key: string]: unknown;
}

export function createSynodHttp(fetchImpl: FetchLike = fetch) {
  return {
    connectInit(body: ConnectInitRequest, baseUrl: string): Promise<ConnectInitResponse> {
      return request(fetchImpl, `${baseUrl}/connect/init`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    connectComplete(body: ConnectCompleteRequest, baseUrl: string): Promise<ConnectCompleteResponse> {
      return request(fetchImpl, `${baseUrl}/connect/complete`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    connectStatus(publicKey: string, baseUrl: string): Promise<ConnectStatusResponse> {
      return request(fetchImpl, `${baseUrl}/connect/status?public_key=${encodeURIComponent(publicKey)}`);
    },

    submitIntent(body: SubmitIntentRequest, baseUrl: string): Promise<SubmitIntentResponse> {
      return request(fetchImpl, `${baseUrl}/intents/submit`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    getPolicy(publicKey: string, baseUrl: string): Promise<PolicyResponse> {
      return request(fetchImpl, `${baseUrl}/policy?public_key=${encodeURIComponent(publicKey)}`);
    },
  };
}

export const synodHttp = createSynodHttp();
