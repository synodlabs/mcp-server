/**
 * tools/intents.ts â€” submit_intent tool
 *
 * Signs the intent payload and submits it to Synod for policy validation
 * and on-chain execution.
 */

import { Asset, Horizon, Memo, Operation, TransactionBuilder, type Keypair } from "@stellar/stellar-sdk";
import { z } from "zod";

import {
  SYNOD_BASE_URL,
  SYNOD_HORIZON_URL,
  SYNOD_STELLAR_NETWORK_PASSPHRASE,
} from "../config.js";
import { canonicalJsonBytes } from "../lib/canonical.js";
import { getErrorMessage } from "../lib/errors.js";
import { synodHttp } from "../transport/http.js";
import { synodWs } from "../transport/websocket.js";
import { getIdentity, getProvider } from "./identity.js";
import type { KeyProvider } from "../akp/index.js";

export const IntentSchema = z.object({
  type: z.string(),
  to: z.string().optional(),
  destination: z.string().optional(),
  amount: z.string().optional(),
  asset: z.string().optional(),
  asset_issuer: z.string().optional(),
  memo: z.string().optional(),
  wallet_address: z.string().optional(),
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
  reason?: string;
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
    const provider = getProvider();
    const signedTransactionXdr = await buildSignedTransactionXdr(intent, provider);
    const { signature } = await provider.sign(canonicalJsonBytes(intent));
    const response = await synodHttp.submitIntent(
      {
        intent,
        signature,
        public_key: identity.publicKey,
        signed_transaction_xdr: signedTransactionXdr,
      },
      SYNOD_BASE_URL
    );

    return {
      success: true,
      intent_id: response.intent_id,
      status: response.status,
      ...(response.reason ? { reason: response.reason } : {}),
      ...(response.tx_hash ? { tx_hash: response.tx_hash } : {}),
      message: `Intent submitted. ID: ${response.intent_id}. Status: ${response.status}.${response.reason ? ` Reason: ${response.reason}.` : ""}${response.tx_hash ? ` Tx: ${response.tx_hash}` : ""}`,
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

async function buildSignedTransactionXdr(intent: Intent, provider: KeyProvider): Promise<string> {
  if (intent.type !== "payment" && intent.type !== "delegate") {
    throw new Error(`Intent type '${intent.type}' is not yet supported for Stellar transaction execution.`);
  }

  const walletAddress = await resolveWalletAddress(intent);
  const destination = intent.to;
  if (!destination) {
    throw new Error("Payment intents require a destination address.");
  }

  const assetCode = intent.asset;
  if (!assetCode) {
    throw new Error("Payment intents require an asset.");
  }
  if (assetCode !== "XLM" && !intent.asset_issuer) {
    throw new Error(`Asset '${assetCode}' requires asset_issuer in the intent.`);
  }

  const server = new Horizon.Server(SYNOD_HORIZON_URL);
  const sourceAccount = await server.loadAccount(walletAddress);
  const asset = assetCode === "XLM"
    ? Asset.native()
    : new Asset(assetCode, intent.asset_issuer);

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase: SYNOD_STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({
      destination,
      asset,
      amount: intent.amount ?? "0",
    }));

  if (intent.memo) {
    transaction.addMemo(Memo.text(intent.memo));
  }

  const built = transaction
    .setTimeout(300)
    .build();

  await provider.withKeypair((keypair: Keypair) => {
    built.sign(keypair);
  });

  return built.toXDR();
}

async function resolveWalletAddress(intent: Intent): Promise<string> {
  if (intent.wallet_address?.trim()) {
    return intent.wallet_address.trim();
  }

  const identity = getIdentity();
  if (!identity) {
    throw new Error("Call initialize_identity first.");
  }

  const policy = await synodHttp.getPolicy(identity.publicKey, SYNOD_BASE_URL);
  const walletRules = policy.rules.filter(
    (rule) => rule.type === "wallet_access" && typeof rule.wallet_address === "string",
  );

  if (walletRules.length === 1) {
    return String(walletRules[0]!.wallet_address);
  }

  if (walletRules.length === 0) {
    throw new Error("No wallet is assigned to this agent in Synod policy.");
  }

  throw new Error("Multiple wallets are assigned to this agent. Include wallet_address in the intent.");
}
