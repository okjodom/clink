import { create } from "zustand";
import { mergeContacts, observedContact, type ContactIndex, type ContactObservation } from "../lib/contacts";

interface ContactsState {
  owner: string | null;
  entries: ContactIndex;
  ready: boolean;
  syncing: boolean;
  error: string | null;
  record(observation: ContactObservation): void;
}

/** Plain contacts live only in memory; persistence contains a signed encrypted event. */
export const useContacts = create<ContactsState>()((set, get) => ({
  owner: null, entries: {}, ready: false, syncing: false, error: null,
  record(value) {
    const state = get();
    if (!state.owner || value.pubkey === state.owner) return;
    const contact = observedContact(value);
    if (!contact) return;
    const entries = mergeContacts(state.entries, [contact]);
    if (entries !== state.entries) set({ entries });
  },
}));
