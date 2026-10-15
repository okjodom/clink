import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import * as wallet from "../services/wallet";
import type { WalletTx } from "../services/wallet";

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
  rates: Record<string, number>;
  lightningAddress: string | null;
  /** LNURL-pay code for the address: a QR any wallet can pay, any time. */
  lnurl: string | null;
  start(): Promise<void>;
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
  rates: {},
  lightningAddress: null,
  lnurl: null,

  async start() {
    if (get().status === "connecting" || get().status === "ready") return;
    set({ status: "connecting", error: undefined });
    try {
      await wallet.connect();
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
        .then((a) => set({ lightningAddress: a?.address ?? null, lnurl: a?.lnurl ?? null }))
        .catch(() => undefined);
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  async refresh() {
    const version = ++refreshVersion;
    try {
      const [b, txs, holdIn] = await Promise.all([wallet.balances(), wallet.listTransactions(60), wallet.holdIn().catch(() => get().holdIn)]);
      if (version !== refreshVersion) return;
      set({ ...valued(b, txs, get().rates.USD), holdIn, error: undefined });
    } catch (e) {
      if (version === refreshVersion) set({ error: (e as Error).message });
    }
  },

  async sync() {
    if (get().status !== "ready") return;
    try {
      await wallet.syncWallet();
      if (get().status === "ready") await get().refresh();
    } catch {
      // Keep the last known balance and pending activity through a network outage.
    }
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
    refreshVersion++;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    unsubscribe?.();
    unsubscribe = null;
    set({ status: "idle", balance: null, sats: null, usd: 0, holdIn: "bitcoin", txs: [], lightningAddress: null, lnurl: null, error: undefined });
  },
  }),
  {
    name: "pontmore.wallet",
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ balance: s.balance, sats: s.sats, usd: s.usd, holdIn: s.holdIn, rates: s.rates, lightningAddress: s.lightningAddress, lnurl: s.lnurl }),
  },
  ),
);
