import type { WalletTx } from "./wallet";
import { encryptedSwapStorage } from "./swapStorage";

const cacheKey = (owner: string) => `pontmore.activity.v1.${owner}`;

/** Private, account-scoped display history. Never used to authorize a payment. */
export async function readActivityCache(owner: string): Promise<WalletTx[] | null> {
  try {
    const value = await encryptedSwapStorage.getItem(cacheKey(owner));
    if (!value) return null;
    const snapshot = JSON.parse(value, (key, value) => {
      if ((key === "amountSats" || key === "feeSats") && typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
      return value;
    });
    if (snapshot.owner !== owner || !Array.isArray(snapshot.txs) || snapshot.txs.length > 60) return null;
    if (!snapshot.txs.every((tx: WalletTx) => typeof tx.id === "string" && ["in", "out"].includes(tx.direction)
      && ["complete", "pending", "failed"].includes(tx.status) && typeof tx.amountSats === "bigint"
      && typeof tx.feeSats === "bigint" && Number.isFinite(tx.timestamp))) return null;
    return snapshot.txs;
  } catch {
    return null;
  }
}

export async function writeActivityCache(owner: string, txs: WalletTx[]): Promise<void> {
  // Invoices aren't needed to render a row; keep this cache small.
  const rows = txs.slice(0, 60).map(({ invoice: _invoice, ...tx }) => tx);
  await encryptedSwapStorage.setItem(cacheKey(owner), JSON.stringify({ owner, txs: rows }, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}

export async function clearActivityCache(owner: string): Promise<void> {
  await encryptedSwapStorage.removeItem(cacheKey(owner));
}
