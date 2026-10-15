/**
 * Who a restored wallet was. The recovery phrase brings back the keys; the
 * name, bio, username and relays live in the profile (kind 0) and relay list
 * (kind 10002) the identity key published, so a restore reads them back.
 */

/** The parts of a Nostr event this needs; signatures are checked by the pool. */
export interface SignedEvent {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface RecoveredIdentity {
  name: string;
  about: string;
  /** Lightning address from the profile, e.g. "jane@breez.tips". */
  lud16?: string;
  /** Relays from the relay list, when one was published. */
  relays?: string[];
}

const PROFILE = 0;
const RELAY_LIST = 10002;

function newest(events: SignedEvent[]): SignedEvent | undefined {
  // NIP-01: newest wins; ties break on lowest id.
  return [...events].sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0];
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** The latest profile and relay list `pubkey` signed, or null if neither is found. */
export function identityFrom(events: SignedEvent[], pubkey: string): RecoveredIdentity | null {
  const mine = events.filter((e) => e.pubkey === pubkey);
  const profile = newest(mine.filter((e) => e.kind === PROFILE));
  const relayList = newest(mine.filter((e) => e.kind === RELAY_LIST));
  if (!profile && !relayList) return null;

  let meta: Record<string, unknown> = {};
  try {
    const parsed: unknown = profile ? JSON.parse(profile.content) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>;
  } catch {
    // A profile we can't read still leaves the relay list worth having.
  }
  const lud16 = text(meta.lud16, 120).toLowerCase();
  const relays = [
    ...new Set(
      (relayList?.tags ?? [])
        .filter((t) => t[0] === "r" && typeof t[1] === "string" && /^wss:\/\/.+/.test(t[1]))
        .map((t) => t[1].trim()),
    ),
  ];
  return {
    name: text(meta.name, 48) || text(meta.display_name, 48),
    about: text(meta.about, 280),
    ...(/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(lud16) ? { lud16 } : {}),
    ...(relays.length ? { relays } : {}),
  };
}

/** "jane@breez.tips" -> "jane", when it is on the same service as `domain`. */
export function usernameToReclaim(lud16: string | undefined, domain: string | null): string | null {
  if (!lud16) return null;
  const [user, host] = lud16.split("@");
  if (!user || !host || (domain && host !== domain)) return null;
  return /^[a-z0-9][a-z0-9._-]{2,30}$/.test(user) ? user : null;
}
