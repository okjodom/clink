import AsyncStorage from "@react-native-async-storage/async-storage";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, type Event } from "nostr-tools/pure";

import { CONTACTS_KIND, CONTACTS_TAG, contactsFingerprint, hasContactUsername, mergeContacts, openContacts, readContactProfile, sealContacts, type Contact } from "../lib/contacts";
import type { KeyRing } from "../lib/keys";
import { useContacts } from "../store/contacts";
import { swapState, useSwaps } from "../store/swaps";
import { query } from "./nostr";

let refreshActive: (() => void) | undefined;
export function refreshContacts(): void { refreshActive?.(); }

/** The index uses a separate authenticated pool and contains only encrypted contact data. */
export function startContacts(keys: KeyRing, relayUrls: string[], legacyAddresses: string[] = [], onLegacySaved?: () => void): () => void {
  const owner = keys.identity;
  const urls = [...new Set(relayUrls)];
  const cacheKey = `clink.contacts.${owner.pk}`;
  const pool = new SimplePool({ enableReconnect: true, enablePing: true });
  pool.automaticallyAuth = () => async (template) => finalizeEvent(template, owner.sk);
  const filter = { kinds: [CONTACTS_KIND], authors: [owner.pk], "#d": [CONTACTS_TAG], limit: 1 };
  let stopped = false;
  let initialized = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let profileTimer: ReturnType<typeof setTimeout> | undefined;
  const checkedProfiles = new Set<string>();
  let writing = false;
  let lastCreatedAt = 0;
  let savedEvent: Event | undefined;
  let savedFingerprint = "";
  let cachedFingerprint = "";
  let remoteFingerprint = "";
  let revision = 0;
  let legacyPending = legacyAddresses.length > 0;
  useContacts.setState({ owner: owner.pk, entries: {}, ready: false, syncing: true, error: null });
  const alive = () => !stopped && useContacts.getState().owner === owner.pk;

  const scheduleProfiles = () => {
    if (!alive()) return;
    clearTimeout(profileTimer);
    profileTimer = setTimeout(() => void resolveProfiles(), 100);
  };
  const resolveProfiles = async () => {
    if (!alive()) return;
    const authors = Object.values(useContacts.getState().entries)
      .filter((contact) => contact.pubkey && !hasContactUsername(contact) && !checkedProfiles.has(contact.pubkey))
      .map((contact) => contact.pubkey!).slice(0, 100);
    if (!authors.length) return;
    authors.forEach((pk) => checkedProfiles.add(pk));
    try {
      const events = await query({ kinds: [0], authors });
      if (!alive()) return;
      const latest = new Map<string, Event>();
      for (const event of events) {
        if (event.kind !== 0 || !authors.includes(event.pubkey)) continue;
        const prior = latest.get(event.pubkey);
        if (!prior || event.created_at > prior.created_at || (event.created_at === prior.created_at && event.id < prior.id)) latest.set(event.pubkey, event);
      }
      const updates: Contact[] = [];
      for (const [pk, event] of latest) {
        const contact = useContacts.getState().entries[pk];
        const profile = readContactProfile(event.content);
        if (contact && profile) updates.push({ ...contact, address: profile.address, name: contact.name ?? profile.name });
      }
      if (updates.length) useContacts.setState({ entries: mergeContacts(useContacts.getState().entries, updates) });
      scheduleProfiles();
    } catch { authors.forEach((pk) => checkedProfiles.delete(pk)); }
  };

  const schedule = (delay = 1500) => {
    if (!initialized || !alive()) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  };
  const merge = (event: Event, remote: boolean) => {
    if (!alive()) return;
    try {
      if (event.created_at > Math.floor(Date.now() / 1000) + 300) return;
      const incoming = openContacts(event, owner);
      lastCreatedAt = Math.max(lastCreatedAt, event.created_at);
      if (remote) remoteFingerprint = contactsFingerprint(incoming);
      else { savedEvent = event; savedFingerprint = contactsFingerprint(incoming); cachedFingerprint = savedFingerprint; }
      const entries = mergeContacts(useContacts.getState().entries, Object.values(incoming));
      useContacts.setState({ entries });
      if (initialized) schedule();
    } catch { /* Ignore malformed or foreign relay/cache data without exposing it in logs. */ }
  };

  const indexSwaps = () => {
    if (!alive()) return;
    for (const rec of Object.values(useSwaps.getState().records)) {
      try {
        const state = swapState(rec);
        if (rec.role === "agent" && state.status === "proposed") continue;
        const peer = rec.role === "customer" ? state.root.agent : state.root.customer;
        const at = Math.min(Math.floor(Date.now() / 1000), Math.max(rec.root.created_at, ...rec.actions.map((a) => a.created_at), ...rec.inbox.filter((i) => i.kind === "chat").map((i) => i.createdAt)));
        useContacts.getState().record({ pubkey: peer, name: rec.local.counterpartyName, role: rec.role === "customer" ? "agent" : "user", at });
      } catch { /* Cached malformed swaps are not contacts. */ }
    }
  };

  const flush = async () => {
    if (!alive() || !initialized) return;
    if (writing) { schedule(); return; }
    writing = true;
    const startedRevision = revision;
    const entries = useContacts.getState().entries;
    const fingerprint = contactsFingerprint(entries);
    try {
      if (!Object.keys(entries).length) { useContacts.setState({ syncing: false }); return; }
      if (fingerprint !== savedFingerprint || !savedEvent) {
        savedEvent = sealContacts(entries, owner, Math.max(Math.floor(Date.now() / 1000), lastCreatedAt + 1));
        lastCreatedAt = savedEvent.created_at;
        savedFingerprint = fingerprint;
      }
      await AsyncStorage.setItem(cacheKey, JSON.stringify(savedEvent));
      cachedFingerprint = fingerprint;
      if (!alive()) return;
      if (legacyPending) { legacyPending = false; onLegacySaved?.(); }
      if (fingerprint === remoteFingerprint) { useContacts.setState({ syncing: false, error: null }); return; }
      useContacts.setState({ syncing: true });
      const result = await Promise.allSettled(pool.publish(urls, savedEvent, { maxWait: 8000 }));
      if (!alive()) return;
      if (!result.some((r) => r.status === "fulfilled")) throw new Error("Contacts are saved on this phone. Nostr sync will retry.");
      remoteFingerprint = fingerprint;
      useContacts.setState({ syncing: false, error: null });
    } catch {
      if (alive()) {
        useContacts.setState({ syncing: false, error: "Contacts will sync when your relays are available." });
        schedule(30_000);
      }
    } finally {
      writing = false;
      if (alive() && startedRevision !== revision) schedule();
    }
  };

  const unsubscribeStore = useContacts.subscribe((state, previous) => {
    if (alive() && state.entries !== previous.entries) { revision++; schedule(); scheduleProfiles(); }
  });
  const unsubscribeSwaps = useSwaps.subscribe((state, previous) => { if (state.records !== previous.records) indexSwaps(); });
  const subscription = pool.subscribeMany(urls, filter, { onevent: (event) => merge(event, true) });
  const refresh = () => {
    if (!alive()) return;
    checkedProfiles.clear();
    scheduleProfiles();
    void pool.querySync(urls, filter, { maxWait: 5000 }).then((events) => {
      if (!alive()) return;
      for (const event of events) merge(event, true);
      schedule();
    }).catch(() => { if (alive()) schedule(30_000); });
  };
  refreshActive = refresh;
  void (async () => {
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached && alive()) { try { merge(JSON.parse(cached), false); } catch { /* Invalid cache. */ } }
      if (!alive()) return;
      const now = Math.floor(Date.now() / 1000);
      legacyAddresses.forEach((address, index) => useContacts.getState().record({ address, role: "user", at: now - index }));
      indexSwaps();
    } finally {
      if (alive()) {
        initialized = true;
        useContacts.setState({ ready: true });
        refresh();
        schedule();
      }
    }
  })().catch(() => { if (alive()) useContacts.setState({ ready: true, syncing: false, error: "Couldn't restore contacts on this phone." }); });

  return () => {
    // Persist the last observation even if the user leaves before the debounce fires.
    const state = useContacts.getState();
    if (state.owner === owner.pk && Object.keys(state.entries).length && contactsFingerprint(state.entries) !== cachedFingerprint) {
      try {
        const final = sealContacts(state.entries, owner, Math.max(Math.floor(Date.now() / 1000), lastCreatedAt + 1));
        void AsyncStorage.setItem(cacheKey, JSON.stringify(final)).catch(() => undefined);
      } catch { /* No plaintext fallback. */ }
    }
    stopped = true;
    clearTimeout(timer);
    clearTimeout(profileTimer);
    unsubscribeStore(); unsubscribeSwaps(); subscription.close(); pool.destroy();
    if (refreshActive === refresh) refreshActive = undefined;
    if (useContacts.getState().owner === owner.pk) useContacts.setState({ owner: null, entries: {}, ready: false, syncing: false, error: null });
  };
}

/** Read a contact's signed public profile only when a payment address is needed. */
export async function contactAddress(contact: Contact): Promise<string> {
  if (contact.address) return contact.address;
  if (!contact.pubkey) throw new Error("No payment username is available for this person yet.");
  const profiles = await query({ kinds: [0], authors: [contact.pubkey], limit: 1 });
  const latest = profiles.filter((e) => e.kind === 0 && e.pubkey === contact.pubkey).sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
  const profile = latest ? readContactProfile(latest.content) : null;
  if (profile) return profile.address;
  throw new Error("This person hasn't published a payment username yet.");
}
