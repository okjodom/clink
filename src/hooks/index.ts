import { useEffect, useMemo, useRef, useState } from "react";

import { BRAND } from "../brand";
import { formatUsd } from "../lib/stablecoins";
import * as wallet from "../services/wallet";

import { settledAt, swapProfit } from "../lib/earnings";
import { formatDecimal, formatFiat, formatSats } from "../lib/money";
import { currencyInfo } from "../lib/channels";
import { bitcoinProvider, isTerminal } from "../protocol/swap";
import { useSession } from "../store/session";
import { swapState, useSwaps, type SwapRecord } from "../store/swaps";
import { useWallet } from "../store/wallet";
import { celebrate } from "../ui/celebrate";
import type { SwapState } from "../protocol/swap";

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export interface SwapItem {
  rec: SwapRecord;
  st: SwapState;
}

export function useSwapList(filter?: (i: SwapItem) => boolean): SwapItem[] {
  const records = useSwaps((s) => s.records);
  return useMemo(() => {
    const items: SwapItem[] = [];
    for (const rec of Object.values(records)) {
      try {
        items.push({ rec, st: swapState(rec) });
      } catch {
        // Unparseable cached root; ignore.
      }
    }
    items.sort((a, b) => b.rec.updatedAt - a.rec.updatedAt);
    return filter ? items.filter(filter) : items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);
}

export function useActiveSwaps(role?: "agent" | "customer"): SwapItem[] {
  const now = useNow(15000);
  const all = useSwapList();
  return useMemo(
    () =>
      all.filter(
        (i) =>
          (!role || i.rec.role === role) &&
          !isTerminal(i.st) &&
          !(i.st.status === "proposed" && now >= i.st.root.expiresAt),
      ),
    [all, role, now],
  );
}

export function useSwap(id: string): SwapItem | null {
  const rec = useSwaps((s) => s.records[id]);
  return useMemo(() => {
    if (!rec) return null;
    try {
      return { rec, st: swapState(rec) };
    } catch {
      return null;
    }
  }, [rec]);
}

/** Format sats in the user's display currency, if a rate is known. */
export function useFiatOf(): (sats: number | bigint) => string | null {
  const currency = useSession((s) => s.currency);
  const rate = useWallet((s) => s.rates[currency]);
  return (sats) => {
    if (!rate) return null;
    const info = currencyInfo(currency);
    return formatFiat((Number(sats) / 1e8) * rate, currency, info.decimals);
  };
}

export interface Money {
  /** The unit amounts lead with: the display currency, or sats when asked for or no rate is known. */
  unit: "fiat" | "sats";
  /** Main figure, e.g. "KES 1,240" (or "48,210 sats"). */
  primary(sats: number | bigint): string;
  /** The other unit, or null when there is no rate. */
  secondary(sats: number | bigint): string | null;
}

/** Local currency first, sats one tap away. */
export function useMoney(): Money {
  const preferSats = useSession((s) => s.preferSats);
  const currency = useSession((s) => s.currency);
  const rate = useWallet((s) => s.rates[currency]);
  const fiatOf = useFiatOf();
  const unit = preferSats || !rate ? "sats" : "fiat";
  return {
    unit,
    primary: (sats) => (unit === "fiat" ? fiatOf(sats)! : formatSats(sats)),
    secondary: (sats) => (!rate ? null : unit === "fiat" ? formatSats(sats) : fiatOf(sats)),
  };
}

/** Worth roughly this much (USD) before the wallet asks for a backup. */
export const BACKUP_NUDGE_USD = 5;
const BACKUP_NUDGE_SATS = 5_000;

/** Whether a balance of `sats` is worth a backup yet (always false once backed up). */
export function useWorthBackingUp(): (sats: number) => boolean {
  const backedUp = useSession((s) => s.backedUp);
  const usd = useWallet((s) => s.rates.USD);
  return (sats) => !backedUp && sats > 0 && (usd ? (sats / 1e8) * usd >= BACKUP_NUDGE_USD : sats >= BACKUP_NUDGE_SATS);
}

/** Ask for a backup once there's money worth protecting, not before the first payment. */
export function useBackupNudge(): boolean {
  const balance = useWallet((s) => s.balance);
  return useWorthBackingUp()(balance ?? 0);
}

export function useMe(): string {
  return useSession((s) => s.keys?.identity.pk ?? "");
}

/**
 * Celebrate each swap the moment it completes, on whatever screen the person
 * is: once per swap, and only for swaps that finished in the last 15 minutes
 * (not ones that arrive later from relays or a restore).
 */
export function useCelebrateFinishedSwaps() {
  const me = useMe();
  const records = useSwaps((s) => s.records);
  useEffect(() => {
    if (!me) return;
    const now = Math.floor(Date.now() / 1000);
    for (const rec of Object.values(records)) {
      if (rec.local.celebratedAt) continue;
      let st: SwapState;
      try {
        st = swapState(rec);
      } catch {
        continue;
      }
      if (st.status !== "settled") continue;
      useSwaps.getState().patchLocal(rec.id, { celebratedAt: now });
      const at = settledAt(st);
      if (at === null || now - at > 15 * 60) continue;
      const getsBitcoin = bitcoinProvider(st.root) !== me;
      const fiat = `${st.root.terms.fiat.currency} ${formatDecimal(st.root.terms.fiat.amount, 0)}`;
      const sats = formatSats(st.root.terms.bitcoin.amount);
      const them = rec.local.counterpartyName || (rec.role === "agent" ? "the customer" : "the agent");
      const profit = swapProfit(rec, st);
      const customer = rec.role === "customer";
      celebrate({
        fiatCode: st.root.terms.fiat.currency,
        amountLabel: customer ? `+${fiat}` : getsBitcoin ? `+${sats}` : `+${fiat}`,
        label: customer ? (getsBitcoin ? "MONEY ADDED" : "CASHED OUT") : undefined,
        caption:
          profit !== null
            ? `You earned ≈ ${st.root.terms.fiat.currency} ${profit.toFixed(2)}`
            : customer
              ? getsBitcoin
                ? `In your wallet, thanks to ${them}`
                : `${capitalize(them)} paid you ${fiat}`
              : getsBitcoin
                ? `Bought from ${them} for ${fiat}`
                : `Sold ${sats} to ${them}`,
        share: customer
          ? `I just ${getsBitcoin ? "topped up" : "cashed out"} ${fiat} with ${BRAND.name} in ${minutes(st)}. No bank, no forms.`
          : undefined,
      });
      return; // one at a time
    }
  }, [records, me]);
}

function capitalize(s: string) {
  return s.startsWith("the ") ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function minutes(st: SwapState): string {
  const at = settledAt(st);
  const m = at ? Math.max(1, Math.round((at - st.root.createdAt) / 60)) : null;
  return m ? `${m} minute${m === 1 ? "" : "s"}` : "minutes";
}

/**
 * Money arriving is the best moment in a wallet: give every incoming payment
 * (not swap escrow, which has its own moment) the full-screen celebration.
 */
export function useCelebrateIncoming() {
  const phase = useSession((s) => s.phase);
  const money = useMoney();
  const currency = useSession((s) => s.currency);
  const ref = useRef(money);
  ref.current = money;
  useEffect(() => {
    if (phase !== "ready") return;
    const startedAt = Math.floor(Date.now() / 1000);
    const seen = new Set<string>();
    return wallet.onWalletEvent((e) => {
      if (e.type !== "payment") return;
      const p = e.payment;
      if (p.direction !== "in" || p.status !== "complete" || p.kind === "htlc" || p.timestamp < startedAt - 5) return;
      if (/^Pont(?:spark|more) swap /.test(p.description ?? "") || seen.has(p.id)) return;
      seen.add(p.id);
      if (p.usd !== undefined) {
        // Dollars: lead with the person's own money when there's a price, the dollars underneath.
        const usdPerBtc = useWallet.getState().rates.USD;
        const sats = usdPerBtc ? Math.round((p.usd / usdPerBtc) * 1e8) : 0;
        celebrate({ fiatCode: "USD", label: "MONEY IN", amountLabel: sats ? `+${ref.current.primary(sats)}` : `+${formatUsd(p.usd)}`, caption: sats ? formatUsd(p.usd) : "Received" });
        return;
      }
      celebrate({ fiatCode: currency, label: "MONEY IN", amountLabel: `+${ref.current.primary(p.amountSats)}`, caption: ref.current.secondary(p.amountSats) ?? "Received" });
    });
  }, [phase, currency]);
}
