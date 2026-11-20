import { decryptSecret } from "../crypto.server";
import { leopardsClient } from "./leopards";
import { postexClient } from "./postex";
import type { CourierClient } from "./types";

export * from "./types";

export { COURIERS } from "./list";

interface CourierSettings {
  courierProvider: string;
  leopardsApiKey: string | null;
  leopardsApiPassword: string | null;
  leopardsTestMode: boolean;
  postexToken: string | null;
  postexPickupAddressCode: string | null;
}

/** Courier client for a shop, or null if none is configured. */
export function courierFor(s: CourierSettings, provider = s.courierProvider): CourierClient | null {
  if (provider === "leopards") {
    const password = decryptSecret(s.leopardsApiPassword);
    if (!s.leopardsApiKey || !password) return null;
    return leopardsClient({ apiKey: s.leopardsApiKey, apiPassword: password, testMode: s.leopardsTestMode });
  }
  if (provider === "postex") {
    const token = decryptSecret(s.postexToken);
    if (!token) return null;
    return postexClient({ token, pickupAddressCode: s.postexPickupAddressCode });
  }
  return null;
}
