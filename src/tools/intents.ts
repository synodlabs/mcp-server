/**
 * tools/intents.ts â€” submit_intent tool
 *
 * Signs the intent payload and submits it to Synod for policy validation
 * and on-chain execution.
 */

import { z } from "zod";

import { SYNOD_BASE_URL } from "../config.js";
import { canonicalJsonBytes } from "../lib/canonical.js";
import { getErrorMessage } from "../lib/errors.js";
import { synodHttp } from "../transport/http.js";
import { synodWs } from "../transport/websocket.js";
import { getIdentity, getProvider } from "./identity.js";

export const IntentSchema = z.object({
  type: z.string(),
  to: z.string().optional(),
  destination: z.string().optional(),
  amount: z.string().optional(),
  asset: z.string().optional(),
  memo: z.string().optional(),
  from_asset: z.string().optional(),
  to_asset: z.string().optional(),
}).catchall(z.unknown()).superRefine((intent, ctx) => {
  const destination = intent.to ?? intent.destination;

  if ((intent.type === "payment" || intent.type === "delegate") && !destination) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Intent type '${intent.type}' requires 'to' or 'destination'.`,
    });
  }

  if ((intent.type === "payment" || intent.type === "delegate") && !intent.asset) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Intent type '${intent.type}' requires 'asset'.`,
    });
  }

  if ((intent.type === "payment" || intent.type === "delegate" || intent.type === "swap") && !intent.amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Intent type '${intent.type}' requires 'amount'.`,
    });
  }

  if (intent.type === "swap" && !intent.from_asset) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Intent type 'swap' requires 'from_asset'.",
    });
  }

  if (intent.type === "swap" && !intent.to_asset) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Intent type 'swap' requires 'to_asset'.",
    });
  }
});

export type Intent = z.infer<typeof IntentSchema>;

export async function submitIntent(rawIntent: unknown): Promise<{
  success: boolean;
  intent_id?: string;
  tx_hash?: string;
  status?: string;
  message: string;
}> {
  const identity = getIdentity();
  if (!identity) {
    return {
      success: false,
      message: "Call initialize_identity first.",
    };
  }

  if (synodWs.status !== "connected") {
    return {
      success: false,
      message: "Not connected to Synod. Call connect_to_synod first.",
    };
  }

  const parsed = IntentSchema.safeParse(rawIntent);
  if (!parsed.success) {
    return {
      success: false,
      message: `Invalid intent: ${parsed.error.message}`,
    };
  }

  try {
    const intent = normalizeIntent(parsed.data);
    const { signature } = await getProvider().sign(canonicalJsonBytes(intent));
    const response = await synodHttp.submitIntent(
      { intent, signature, public_key: identity.publicKey },
      SYNOD_BASE_URL
    );

    return {
      success: true,
      intent_id: response.intent_id,
      status: response.status,
      ...(response.tx_hash ? { tx_hash: response.tx_hash } : {}),
      message: `Intent submitted. ID: ${response.intent_id}. Status: ${response.status}.${response.tx_hash ? ` Tx: ${response.tx_hash}` : ""}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to submit intent. ${getErrorMessage(error, "Unknown Synod error.")}`,
    };
  }
}

function normalizeIntent(intent: Intent): Intent {
  const normalized: Intent = { ...intent };

  if (!normalized.to && normalized.destination) {
    normalized.to = normalized.destination;
  }

  delete normalized.destination;
  return normalized;
}
