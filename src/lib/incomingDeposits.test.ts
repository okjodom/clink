import type { WalletTx } from "../services/wallet";
import { withIncomingDeposits } from "./incomingDeposits";

const txid = "a".repeat(64);
const deposit = { txid, vout: 0, amountSats: 2000n, isMature: false };
const payment = (overrides: Partial<WalletTx> = {}): WalletTx => ({
  id: "settled", direction: "in", amountSats: 1900n, feeSats: 100n,
  kind: "onchain", status: "complete", timestamp: 200,
  blockchainTxId: txid, blockchainVout: 0, ...overrides,
});

it("shows a detected deposit as pending with its real blockchain hash", () => {
  const [tx] = withIncomingDeposits([], [deposit], new Map(), 100);
  expect(tx).toMatchObject({ direction: "in", status: "pending", statusLabel: "Confirming", amountSats: 2000n, blockchainTxId: txid, detectedAt: 100 });
  expect(tx.explorerUrl).toBe(`https://mempool.space/tx/${txid}`);
  expect(tx.pendingReason).toMatch(/available balance/);
});

it("keeps the first detection time and follows confirmation through settlement without duplicates", () => {
  const seen = new Map<string, number>();
  withIncomingDeposits([], [deposit], seen, 100);
  expect(withIncomingDeposits([], [deposit], seen, 150)[0].timestamp).toBe(100);
  expect(withIncomingDeposits([], [{ ...deposit, isMature: true }], seen, 180)[0].statusLabel).toBe("Adding to balance");
  expect(withIncomingDeposits([payment()], [{ ...deposit, isMature: true }], seen, 200)).toEqual([payment()]);
  expect(withIncomingDeposits([], [{ ...deposit, isMature: true }], seen, 220)).toEqual([]);
});

it("deduplicates by output, leaving another incoming output visible", () => {
  const txs = withIncomingDeposits([payment()], [deposit, { ...deposit, vout: 1 }], new Map(), 100);
  expect(txs).toHaveLength(2);
  expect(txs[0]).toMatchObject({ status: "pending", blockchainVout: 1 });
});

it("does not resurrect already-claimed or instant-claimed outputs", () => {
  expect(withIncomingDeposits([], [{ ...deposit, isMature: true }, { ...deposit, vout: 1, instantClaimStatus: { tag: "Claimed" } }], new Map(), 100)).toEqual([]);
});

it("keeps blocked claims and refunds visible without treating them as spendable", () => {
  expect(withIncomingDeposits([], [{ ...deposit, isMature: true, claimError: { tag: "MaxDepositClaimFeeExceeded" } }], new Map(), 100)[0])
    .toMatchObject({ status: "pending", statusLabel: "Fee approval needed", depositClaim: "fee-required" });
  expect(withIncomingDeposits([], [{ ...deposit, refundTxId: "b".repeat(64) }], new Map(), 100)[0])
    .toMatchObject({ status: "pending", statusLabel: "Refund pending" });
});

it("does not offer another approval for submitted or fee-approved deposits", () => {
  const blocked = { ...deposit, isMature: true, claimError: { tag: "MaxDepositClaimFeeExceeded", inner: { requiredFeeSats: 300n } } };
  const submitted = withIncomingDeposits([], [{ ...blocked, instantClaimStatus: { tag: "Submitted" } }], new Map(), 100)[0];
  expect(submitted).toMatchObject({ status: "pending", statusLabel: "Adding to balance", depositClaim: "submitted" });
  const approved = withIncomingDeposits([], [{ ...blocked, maxClaimFee: { tag: "Fixed", inner: { amount: 300n } } }], new Map(), 100)[0];
  expect(approved).toMatchObject({ status: "pending", statusLabel: "Adding to balance", depositClaim: "approved" });
  const higher = withIncomingDeposits([], [{ ...blocked, maxClaimFee: { tag: "Fixed", inner: { amount: 200n } } }], new Map(), 100)[0];
  expect(higher.depositClaim).toBe("fee-required");
});
