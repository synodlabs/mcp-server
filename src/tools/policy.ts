/**
 * tools/policy.ts — get_policy tool
 */

import { synodHttp }    from "../transport/http.js";
import { getIdentity }  from "./identity.js";
import { SYNOD_BASE_URL } from "../config.js";
import { getErrorMessage } from "../lib/errors.js";

export async function getPolicy(): Promise<{
  success: boolean;
  policy?: unknown;
  message: string;
}> {
  const identity = getIdentity();
  if (!identity) return { success: false, message: "Call initialize_identity first." };

  try {
    const policy = await synodHttp.getPolicy(identity.publicKey, SYNOD_BASE_URL);
    return {
      success: true,
      policy,
      message: `Policy fetched. ${policy.rules.length} rule(s) active.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to fetch policy. ${getErrorMessage(error, "Unknown Synod error.")}`,
    };
  }
}
