import { finalizeEvent, verifyEvent, type Event } from "nostr-tools/pure";
import { decrypt, encrypt, getConversationKey } from "nostr-tools/nip44";
import type { KeyPair } from "./keys";

export const CONTACTS_KIND = 30078;
export const CONTACTS_TAG = "clink.contacts.v1";
export type ContactRole = "user" | "agent";
export interface Contact {
  id: string;
  pubkey?: string;
  address?: string;
  name?: string;
  roles: ContactRole[];
  lastAt: number;
}
export type ContactIndex = Record<string, Contact>;
export interface ContactObservation {
  pubkey?: string;
  address?: string;
  name?: string;
  role: ContactRole;
  at: number;
}

export function hasContactUsername(contact: Pick<Contact, "address">): boolean {
  return typeof contact.address === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.address);
}

export function readContactProfile(content: string): { address: string; name?: string } | null {
  try {
    const profile = JSON.parse(content);
    if (!hasContactUsername({ address: profile?.lud16 })) return null;
    const name = typeof profile.display_name === "string" ? profile.display_name : profile.name;
    return { address: profile.lud16.trim().toLowerCase(), ...(typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 80) } : {}) };
  } catch { return null; }
}

export function observedContact(value: ContactObservation): Contact | null {
  const pubkey = value.pubkey?.toLowerCase();
  const rawAddress = value.address?.trim();
  const address = rawAddress?.includes("@") ? rawAddress.toLowerCase() : rawAddress;
  if ((pubkey && !/^[0-9a-f]{64}$/.test(pubkey)) || (address && (address.length > 2048 || /\s/.test(address)))) return null;
  if ((!pubkey && !address) || !["user", "agent"].includes(value.role) || !Number.isSafeInteger(value.at) || value.at < 0) return null;
  return {
    id: pubkey ?? `address:${address}`,
    ...(pubkey ? { pubkey } : {}), ...(address ? { address } : {}),
    ...(value.name?.trim() ? { name: value.name.trim().slice(0, 80) } : {}),
    roles: [value.role], lastAt: value.at,
  };
}

/** Append-only union: stale/offline snapshots cannot remove a known counterparty. */
export function mergeContacts(current: ContactIndex, incoming: Iterable<Contact>): ContactIndex {
  const merged = { ...current };
  for (const contact of incoming) {
    const previous = merged[contact.id];
    if (!previous) { merged[contact.id] = contact; continue; }
    const newer = contact.lastAt > previous.lastAt || (contact.lastAt === previous.lastAt && JSON.stringify(contact) > JSON.stringify(previous)) ? contact : previous;
    const older = newer === contact ? previous : contact;
    merged[contact.id] = {
      ...older, ...newer,
      name: newer.name ?? older.name,
      address: newer.address ?? older.address,
      roles: [...new Set([...previous.roles, ...contact.roles])].sort() as ContactRole[],
      lastAt: Math.max(previous.lastAt, contact.lastAt),
    };
  }
  // A signed profile/selected contact can connect an address-only payment to a
  // known identity. Never collapse two public keys that claim the same address.
  for (const contact of Object.values(merged)) {
    if (contact.pubkey || !contact.address) continue;
    const matches = Object.values(merged).filter((c) => c.pubkey && c.address === contact.address);
    if (matches.length !== 1) continue;
    const identified = matches[0];
    merged[identified.id] = {
      ...identified,
      name: identified.name ?? contact.name,
      roles: [...new Set([...identified.roles, ...contact.roles])].sort() as ContactRole[],
      lastAt: Math.max(identified.lastAt, contact.lastAt),
    };
    delete merged[contact.id];
  }
  return contactsFingerprint(current) === contactsFingerprint(merged) ? current : merged;
}

export function contactsFingerprint(index: ContactIndex): string {
  return JSON.stringify(Object.values(index).sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({
    id: c.id, pubkey: c.pubkey, address: c.address, name: c.name, roles: [...c.roles].sort(), lastAt: c.lastAt,
  })));
}

export function parseContactIndex(raw: string): ContactIndex {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object" || (data as { v?: unknown }).v !== 1 || !Array.isArray((data as { contacts?: unknown }).contacts)) throw new Error("Invalid contact index");
  const index: ContactIndex = {};
  for (const item of (data as { contacts: unknown[] }).contacts) {
    if (!item || typeof item !== "object") throw new Error("Invalid contact");
    const c = item as Record<string, unknown>;
    if ((c.pubkey !== undefined && typeof c.pubkey !== "string") || (c.address !== undefined && typeof c.address !== "string") || (c.name !== undefined && typeof c.name !== "string") || typeof c.lastAt !== "number" || !Array.isArray(c.roles) || !c.roles.length || c.roles.some((r) => r !== "user" && r !== "agent")) throw new Error("Invalid contact");
    const contact = observedContact({ pubkey: c.pubkey as string | undefined, address: c.address as string | undefined, name: c.name as string | undefined, role: c.roles[0], at: c.lastAt });
    if (!contact || c.id !== contact.id) throw new Error("Invalid contact identity");
    index[contact.id] = { ...contact, roles: [...new Set(c.roles)].sort() as ContactRole[] };
  }
  return index;
}

/** Only the owner's key can open the index; no counterparty appears in public tags. */
export function sealContacts(index: ContactIndex, owner: KeyPair, createdAt: number): Event {
  const key = getConversationKey(owner.sk, owner.pk);
  return finalizeEvent({ kind: CONTACTS_KIND, created_at: createdAt, tags: [["d", CONTACTS_TAG]],
    content: encrypt(JSON.stringify({ v: 1, contacts: JSON.parse(contactsFingerprint(index)) }), key),
  }, owner.sk);
}

export function openContacts(event: Event, owner: KeyPair): ContactIndex {
  if (event.pubkey !== owner.pk || event.kind !== CONTACTS_KIND || event.tags.length !== 1 || event.tags[0]?.[0] !== "d" || event.tags[0]?.[1] !== CONTACTS_TAG || !verifyEvent(event)) throw new Error("Invalid private contact event");
  return parseContactIndex(decrypt(event.content, getConversationKey(owner.sk, owner.pk)));
}
