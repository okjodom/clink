import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import * as wallet from "../services/wallet";
import type { WalletTx } from "../services/wallet";
import { clearActivityCache, readActivityCache, writeActivityCache } from "../services/activityCache";
import { errorText } from "../lib/errors";

interface WalletState {
  status: "idle" | "connecting" | "ready" | "error";
  error?: string;
  /** Everything the wallet holds, in sats: bitcoin plus dollars at today's price. */
  balance: number | null;
  /** The parts: bitcoin, and dollars held as USDB. */
  sats: number | null;
  usd: number;
  holdIn: wallet.HoldIn;
  txs: WalletTx[];
  activityLoaded: boolean;
  activityRefreshing: boolean;
  activitySyncing: boolean;
  rates: Record<string, number>;
  lightningAddress: string | null;
  /** LNURL-pay code for the address: a QR any wallet can pay, any time. */
  lnurl: string | null;
  start(owner?: string): Promise<void>;
  refresh(): Promise<void>;
  sync(): Promise<void>;
  refreshRates(): Promise<void>;
  setLightningAddress(a: string | null, lnurl?: string | null): void;
  /** Keep the money in dollars or in bitcoin; converts what's there now. */
  setHoldIn(to: wallet.HoldIn): Promise<void>;
  reset(): void;
}

/** Dollars count at today's price, so one balance covers both. */
function valued(b: wallet.Balances, txs: WalletTx[], usdPerBtc: number | undefined) {
  const asSats = (usd: number) => (usdPerBtc ? Math.round((usd / usdPerBtc) * 1e8) : 0);
  return {
    sats: Number(b.sats),
    usd: b.usd,
    balance: Number(b.sats) + asSats(b.usd),
    txs: txs.map((t) => (t.usd === undefined ? t : { ...t, amountSats: BigInt(asSats(t.usd)), feeSats: BigInt(asSats(t.feeUsd ?? 0)) })),
  };
}

let unsubscribe: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshVersion = 0;
let foregroundSync: Promise<void> | null = null;
let activityOwner: string | null = null;
let walletEpoch = 0;

// Balance, rates and address are cached so the wallet opens on numbers, not a spinner.
export const useWallet = create<WalletState>()(
  persist(
  (set, get) => ({
  status: "idle",
  balance: null,
  sats: null,
  usd: 0,
  holdIn: "bitcoin",
  txs: [],
  activityLoaded: false,
  activityRefreshing: false,
  activitySyncing: false,
  rates: {},
  lightningAddress: null,
  lnurl: null,

  async start(owner) {
    if (get().status === "connecting" || get().status === "ready") return;
    if (owner) activityOwner = owner;
    const cacheOwner = activityOwner;
    const epoch = walletEpoch;
    if (cacheOwner) void readActivityCache(cacheOwner).then((txs) => {
      if (txs && epoch === walletEpoch && !get().activityLoaded) {
        set({ txs: valued({ sats: BigInt(get().sats ?? 0), usd: get().usd }, txs, get().rates.USD).txs, activityLoaded: true });
      }
    }).catch(() => undefined);
    set({ status: "connecting", error: undefined });
    try {
      await wallet.connect();
      if (epoch !== walletEpoch) return;
      unsubscribe?.();
      unsubscribe = wallet.onWalletEvent(() => {
        // Events arrive in bursts; coalesce into one refresh.
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => void get().refresh(), 400);
      });
      set({ status: "ready" });
      await Promise.all([get().refresh(), get().refreshRates()]);
      void get().sync();
      wallet
        .lightningAddressInfo()
        .then((a) => { if (epoch === walletEpoch) set({ lightningAddress: a?.address ?? null, lnurl: a?.lnurl ?? null }); })
        .catch(() => undefined);
    } catch (e) {
      if (epoch === walletEpoch) set({ status: "error", error: errorText(e) });
    }
  },

  async refresh() {
    const version = ++refreshVersion;
    const cacheOwner = activityOwner;
    set({ activityRefreshing: true });
    try {
      await Promise.all([
        wallet.listTransactions(60).then((txs) => {
          if (version !== refreshVersion) return;
          set({ txs: valued({ sats: BigInt(get().sats ?? 0), usd: get().usd }, txs, get().rates.USD).txs, activityLoaded: true });
          if (cacheOwner) void writeActivityCache(cacheOwner, txs).catch(() => undefined);
        }),
        Promise.all([wallet.balances(), wallet.holdIn().catch(() => get().holdIn)]).then(([b, holdIn]) => {
          if (version === refreshVersion) set({ ...valued(b, get().txs, get().rates.USD), holdIn });
        }),
      ]);
      if (version === refreshVersion) set({ error: undefined });
    } catch (e) {
      if (version === refreshVersion) set({ error: errorText(e) });
    } finally {
      if (version === refreshVersion) set({ activityRefreshing: false });
    }
  },

  async sync() {
    if (get().status !== "ready") return;
    if (foregroundSync) return foregroundSync;
    set({ activitySyncing: true });
    const running = (async () => {
      try {
        await wallet.syncWallet();
        if (get().status === "ready") await get().refresh();
      } catch {
        // Keep the last known balance and pending activity through a network outage.
      }
    })();
    foregroundSync = running;
    try { await running; }
    finally { if (foregroundSync === running) { foregroundSync = null; set({ activitySyncing: false }); } }
  },

  async refreshRates() {
    try {
      const rates = await wallet.fiatRates();
      const { sats, usd, txs } = get();
      set({ rates, ...(sats !== null ? valued({ sats: BigInt(sats), usd }, txs, rates.USD) : {}) });
    } catch {
      // Rates are a convenience; the wallet works without them.
    }
  },

  setLightningAddress: (a, lnurl = null) => set({ lightningAddress: a, lnurl }),

  async setHoldIn(to) {
    const before = get().holdIn;
    set({ holdIn: to });
    try {
      await wallet.setHoldIn(to);
      await get().refresh();
    } catch (e) {
      set({ holdIn: before });
      throw e;
    }
  },

  reset() {
    walletEpoch++;
    refreshVersion++;
    if (activityOwner) void clearActivityCache(activityOwner).catch(() => undefined);
    activityOwner = null;
    foregroundSync = null;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    unsubscribe?.();
    unsubscribe = null;
    set({ status: "idle", balance: null, sats: null, usd: 0, holdIn: "bitcoin", txs: [], activityLoaded: false, activityRefreshing: false, activitySyncing: false, lightningAddress: null, lnurl: null, error: undefined });
  },
  }),
  {
    name: "pontmore.wallet",
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ balance: s.balance, sats: s.sats, usd: s.usd, holdIn: s.holdIn, rates: s.rates, lightningAddress: s.lightningAddress, lnurl: s.lnurl }),
  },
  ),
);
