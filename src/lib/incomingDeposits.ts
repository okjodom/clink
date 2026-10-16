import type { WalletTx } from "../services/wallet";
import { transactionExplorer } from "./explorers";

type Deposit = {
  txid: string; vout: number; amountSats: bigint; isMature: boolean;
  claimError?: unknown; instantClaimStatus?: { tag: string }; refundTx?: string; refundTxId?: string;
  maxClaimFee?: { tag: string; inner?: unknown };
};

export function depositClaimState(deposit: Deposit): WalletTx["depositClaim"] {
  if (deposit.refundTx || deposit.refundTxId || deposit.instantClaimStatus?.tag === "Claimed") return undefined;
  if (deposit.instantClaimStatus?.tag === "Submitted") return "submitted";
  const error = deposit.claimError as { tag?: string; inner?: { requiredFeeSats?: bigint } } | undefined;
  if (!deposit.isMature || error?.tag !== "MaxDepositClaimFeeExceeded") return undefined;
  const cap = deposit.maxClaimFee;
  const amount = (cap?.inner as { amount?: unknown } | undefined)?.amount;
  if (cap?.tag === "Fixed" && typeof amount === "bigint" && typeof error.inner?.requiredFeeSats === "bigint"
      && amount >= error.inner.requiredFeeSats) return "approved";
  return "fee-required";
}

/** Deposits are activity before they are spendable; the balance still comes from the SDK. */
export function withIncomingDeposits(txs: WalletTx[], deposits: Deposit[], firstSeen: Map<string, number>, now: number): WalletTx[] {
  const present = new Set(deposits.map((deposit) => `bitcoin-deposit:${deposit.txid}:${deposit.vout}`));
  for (const id of firstSeen.keys()) if (!present.has(id)) firstSeen.delete(id);
  const pending: WalletTx[] = [];
  for (const deposit of deposits) {
    const id = `bitcoin-deposit:${deposit.txid}:${deposit.vout}`;
    const represented = txs.some((tx) => tx.direction === "in" && tx.blockchainTxId === deposit.txid && tx.blockchainVout === deposit.vout);
    if (represented || deposit.instantClaimStatus?.tag === "Claimed") {
      firstSeen.delete(id);
      continue;
    }
    // The SDK also retains mature, already-claimed outputs until they are spent.
    if (deposit.isMature && !deposit.claimError && !firstSeen.has(id) && deposit.instantClaimStatus?.tag !== "Submitted") continue;
    if (!firstSeen.has(id)) firstSeen.set(id, now);
    const refund = !!deposit.refundTx || !!deposit.refundTxId;
    const claim = depositClaimState(deposit);
    const attention = !!deposit.claimError && deposit.isMature && !["approved", "submitted"].includes(claim ?? "");
    pending.push({
      id, direction: "in", amountSats: BigInt(deposit.amountSats), feeSats: 0n,
      kind: "onchain", status: "pending", timestamp: firstSeen.get(id)!, detectedAt: firstSeen.get(id),
      depositClaim: claim,
      statusLabel: refund ? "Refund pending" : claim === "fee-required" ? "Fee approval needed" : attention ? "Needs attention" : deposit.isMature || claim === "submitted" ? "Adding to balance" : "Confirming",
      pendingReason: refund ? "This deposit is being returned on-chain. It is not in your available balance."
        : claim === "fee-required" ? "Approve the deposit fee to add this bitcoin to your available balance."
        : claim === "approved" || claim === "submitted" ? "This deposit is being added to your available balance. No further approval is needed."
        : attention ? "This deposit couldn't be added automatically. Your bitcoin is still on-chain; check again for an updated status."
        : "Bitcoin detected on-chain. It will be added to your available balance after confirmation and the deposit fee.",
      blockchainTxId: deposit.txid, blockchainVout: deposit.vout,
      explorerUrl: transactionExplorer("bitcoin", deposit.txid),
    });
  }
  return [...txs, ...pending].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.timestamp - a.timestamp);
}
