/**
 * Session: wallet presence, derived keys, mode and user preferences.
 * Secrets stay in the keychain; only preferences are persisted here.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_RELAYS } from "../services/config";
import { setRelays } from "../services/nostr";
import * as wallet from "../services/wallet";
import { deriveKeyRing, type KeyRing } from "../lib/keys";

export type Mode = "user" | "agent";
export type Phase = "loading" | "onboarding" | "ready";

export interface Profile {
  name: string;
  about: string;
}

interface SessionState {
  phase: Phase;
  keys: KeyRing | null;
  // persisted
  mode: Mode;
  backedUp: boolean;
  relays: string[];
  currency: string;
  profile: Profile;
  hideBalance: boolean;
  /** Amounts lead with sats instead of the display currency. */
  preferSats: boolean;
  /** A new wallet still has to pick the name people pay it by. */
  needsName: boolean;
  /** People this wallet paid, newest first, for one-tap repeat payments. */
  recents: string[];
  hydrated: boolean;

  boot(): Promise<void>;
  createWallet(): Promise<void>;
  restoreWallet(phrase: string): Promise<void>;
  setMode(mode: Mode): void;
  markBackedUp(): void;
  setRelays(relays: string[]): void;
  setCurrency(code: string): void;
  setProfile(p: Profile): void;
  toggleHideBalance(): void;
  togglePreferSats(): void;
  finishNaming(): void;
  addRecent(to: string): void;
  signOut(): Promise<void>;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      phase: "loading",
      keys: null,
      mode: "user",
      backedUp: false,
      relays: DEFAULT_RELAYS,
      currency: "KES",
      profile: { name: "", about: "" },
      hideBalance: false,
      preferSats: false,
      needsName: false,
      recents: [],
      hydrated: false,

      async boot() {
        setRelays(get().relays);
        const mnemonic = await wallet.storedMnemonic();
        if (!mnemonic) {
          set({ phase: "onboarding", keys: null });
          return;
        }
        set({ keys: deriveKeyRing(mnemonic), phase: "ready" });
      },

      async createWallet() {
        const mnemonic = await wallet.createMnemonic();
        set({ keys: deriveKeyRing(mnemonic), backedUp: false, needsName: true, phase: "ready" });
      },

      async restoreWallet(phrase) {
        const mnemonic = await wallet.restoreMnemonic(phrase);
        // A restored phrase is, by definition, already written down.
        set({ keys: deriveKeyRing(mnemonic), backedUp: true, needsName: false, phase: "ready" });
      },

      setMode: (mode) => set({ mode }),
      markBackedUp: () => set({ backedUp: true }),
      setRelays(relays) {
        const clean = [...new Set(relays.map((r) => r.trim()).filter((r) => /^wss:\/\/.+/.test(r)))];
        const next = clean.length ? clean : DEFAULT_RELAYS;
        setRelays(next);
        set({ relays: next });
      },
      setCurrency: (currency) => set({ currency }),
      setProfile: (profile) => set({ profile }),
      toggleHideBalance: () => set({ hideBalance: !get().hideBalance }),
      togglePreferSats: () => set({ preferSats: !get().preferSats }),
      finishNaming: () => set({ needsName: false }),
      addRecent: (to) => set({ recents: [to, ...get().recents.filter((r) => r !== to)].slice(0, 8) }),

      async signOut() {
        await wallet.wipeWallet();
        set({ keys: null, phase: "onboarding", backedUp: false, mode: "user", needsName: false, recents: [], profile: { name: "", about: "" } });
      },
    }),
    {
      name: "pontmore.session",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        mode: s.mode,
        backedUp: s.backedUp,
        relays: s.relays,
        currency: s.currency,
        profile: s.profile,
        hideBalance: s.hideBalance,
        preferSats: s.preferSats,
        needsName: s.needsName,
        recents: s.recents,
      }),
      onRehydrateStorage: () => () => useSession.setState({ hydrated: true }),
    },
  ),
);

export function requireKeys(): KeyRing {
  const keys = useSession.getState().keys;
  if (!keys) throw new Error("Wallet is not set up");
  return keys;
}
