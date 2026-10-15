/**
 * Dollars in the wallet, and USDT/USDC on other chains.
 *
 * The wallet can hold its value in USDB, a dollar token on Spark (1 USDB =
 * 1 USD, 6 decimals). People elsewhere pay and get paid in USDT or USDC on
 * their own chains; Breez bridges those to and from the wallet. These are the
 * pure parts: units, names, and spotting a stablecoin address.
 */

/** USDB on Spark mainnet (issued by Brale). */
export const USDB_TOKEN = "btkn1xgrvjwey5ngcagvap2dzzvsy4uk8ua9x69k82dwvt5e7ef9drm9qztux87";
/** The label Breez's stable balance uses for it. */
export const DOLLARS_LABEL = "USD";

/** "12.5" dollars -> base units of a `decimals`-place token, without float error. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const m = amount.trim().match(/^(\d*)(?:\.(\d*))?$/);
  if (!m || (!m[1] && !m[2])) throw new Error(`Not an amount: ${amount}`);
  const whole = m[1] || "0";
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

/** Base units -> a number of dollars, for display. */
export function fromBaseUnits(units: bigint, decimals: number): number {
  const scale = 10n ** BigInt(decimals);
  return Number(units / scale) + Number(units % scale) / Number(scale);
}

/** Keep the exact quoted deposit, including sub-cent token units. */
export function tokenAmount(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const fraction = (units % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${units / scale}${fraction ? `.${fraction}` : ""}`;
}

export function quoteExpiry(value: string | number | bigint): number {
  const seconds = typeof value === "string" && !/^\d+(\.\d+)?$/.test(value) ? Date.parse(value) / 1000 : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("The payment quote has an invalid expiry. Request a new quote.");
  return seconds;
}

/** "$12.50": stablecoins are always shown in dollars, whatever the wallet's currency. */
export function formatUsd(usd: number): string {
  return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CHAINS: Record<string, string> = {
  tron: "Tron",
  ethereum: "Ethereum",
  base: "Base",
  solana: "Solana",
  arbitrum: "Arbitrum",
  "arbitrum one": "Arbitrum",
  polygon: "Polygon",
  optimism: "Optimism",
  bsc: "BNB Chain",
  "bnb chain": "BNB Chain",
  avalanche: "Avalanche",
};

/** "arbitrum" -> "Arbitrum", "bsc" -> "BNB Chain". */
export function chainLabel(chain: string): string {
  const k = chain.trim().toLowerCase();
  return CHAINS[k] ?? k.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Providers name bridged USDT "USDT0"; to the person it's USDT. */
export function assetLabel(asset: string): string {
  const a = asset.trim().toUpperCase();
  return a.startsWith("USDT") ? "USDT" : a.startsWith("USDC") ? "USDC" : a;
}

/**
 * Chains most people already use for USDT/USDC, first. Cheap, common chains
 * lead; the rest follow alphabetically.
 */
const POPULAR = ["tron", "solana", "base", "ethereum", "arbitrum", "polygon", "bsc"];

export function chainOrder(a: string, b: string): number {
  const ia = POPULAR.indexOf(a.toLowerCase());
  const ib = POPULAR.indexOf(b.toLowerCase());
  if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  return chainLabel(a).localeCompare(chainLabel(b));
}

/**
 * Looks like a USDT/USDC address: EVM (0x + 40 hex), Tron (T + 33 base58) or
 * Solana (32–44 base58). Good enough to offer a paste; the SDK has the final say.
 */
export function looksLikeStablecoinAddress(text: string): boolean {
  const t = text.trim();
  return (
    /^0x[0-9a-fA-F]{40}$/.test(t) ||
    /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(t) ||
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t) ||
    /^(ethereum|solana|tron):/i.test(t)
  );
}
