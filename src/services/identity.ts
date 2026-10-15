/**
 * Bring back who a restored wallet was: its name, bio, username and relays.
 * See lib/identity.ts for what is read and why.
 */
import { identityFrom, usernameToReclaim, type RecoveredIdentity } from "../lib/identity";
import type { KeyRing } from "../lib/keys";
import { KIND } from "../protocol/constants";
import { DEFAULT_RELAYS } from "./config";
import { getRelays, query } from "./nostr";
import * as wallet from "./wallet";

/** How long a restore waits on relays before carrying on without them. */
const WAIT_MS = 6000;

export async function recoverIdentity(keys: KeyRing): Promise<RecoveredIdentity | null> {
  const filter = { kinds: [KIND.profile, KIND.relayList], authors: [keys.identity.pk] };
  const urls = [...getRelays(), ...DEFAULT_RELAYS];
  const found = identityFrom(await query(filter, WAIT_MS, urls), keys.identity.pk);
  // Someone who moved to their own relays may only have their profile there.
  const extra = (found?.relays ?? []).filter((r) => !urls.includes(r));
  if (found && extra.length && !found.name) {
    return identityFrom(await query(filter, WAIT_MS, [...urls, ...extra]), keys.identity.pk) ?? found;
  }
  return found;
}

/**
 * The wallet's Lightning address, from Breez or, failing that, by claiming
 * the profile's username again. Null if neither works.
 */
export async function restoreLightningAddress(lud16: string | undefined): Promise<wallet.AddressInfo | null> {
  const username = usernameToReclaim(lud16, wallet.lightningDomain());
  if (!username) return wallet.lightningAddressInfo();
  return wallet.reclaimLightningAddress(username);
}
