import { MaxFee, type BreezSdkInterface, type DepositInfo } from "@breeztech/breez-sdk-spark-react-native";
import { connect } from "./wallet";
import { depositClaimState } from "../lib/incomingDeposits";

export interface DepositClaimReview {
  readonly id: string;
  readonly amountSats: bigint;
  readonly feeSats: bigint;
  readonly receiveSats: bigint;
  readonly expiresAt: number;
}
export type DepositClaimResult = { status: "complete"; paymentId: string } | { status: "submitted" } | { status: "waiting"; feeChanged: boolean };

const reviews = new WeakMap<DepositClaimReview, { sdk: BreezSdkInterface; used: boolean }>();
const inFlight = new Set<string>();

function outpoint(id: string) {
  const match = /^bitcoin-deposit:([0-9a-f]{64}):(\d+)$/.exec(id);
  if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) > 0xffffffff) throw new Error("This isn't a pending Bitcoin deposit.");
  return { txid: match[1], vout: Number(match[2]) };
}

async function pendingDeposit(sdk: BreezSdkInterface, id: string): Promise<DepositInfo> {
  const point = outpoint(id);
  const { deposits } = await sdk.listUnclaimedDeposits({});
  const deposit = deposits.find((item) => item.txid === point.txid && item.vout === point.vout);
  if (!deposit) throw new Error("This deposit's status changed. Refresh Activity.");
  if (deposit.refundTx || deposit.refundTxId) throw new Error("This deposit is being refunded.");
  if (["Submitted", "Claimed"].includes(deposit.instantClaimStatus?.tag ?? "")) throw new Error("This deposit is already being added. Check Activity for its status.");
  if (!deposit.isMature) throw new Error("This deposit is still confirming. It will be added when ready.");
  if (depositClaimState(deposit) === "approved") throw new Error("The fee is already approved. The wallet will add this deposit automatically.");
  if (deposit.claimError?.tag !== "MaxDepositClaimFeeExceeded") throw new Error("This deposit doesn't need a fee approval. Refresh its status.");
  return deposit;
}

function standardFee(deposit: DepositInfo) {
  const error = deposit.claimError;
  if (error?.tag !== "MaxDepositClaimFeeExceeded") throw new Error("This deposit doesn't need a fee approval. Refresh its status.");
  const { requiredFeeSats: feeSats, requiredFeeRateSatPerVbyte: rate } = error.inner;
  if (typeof feeSats !== "bigint" || feeSats <= 0n || typeof rate !== "bigint") throw new Error("Couldn't verify the deposit fee. Refresh its status.");
  if (feeSats >= deposit.amountSats) throw new Error("The deposit is too small to cover the current fee. Wait for fees to fall.");
  // Standard claims use the larger of the global ceiling and this approval.
  // The global ceiling is explicitly 1 sat/vB; only offer approvals above it.
  if (rate <= 1n) throw new Error("Fees have dropped. Refresh the deposit so the wallet can add it automatically.");
  return { feeSats, creditAmountSats: deposit.amountSats - feeSats };
}

/** Review the SDK-reported standard claim fee for this mature deposit only.
 * This is a maximum approval, not a promise of the eventual network fee.
 * Avoid a separate chain-service quote request: it can hang while offline. */
export async function prepareDepositClaim(id: string): Promise<DepositClaimReview> {
  const sdk = await connect();
  const deposit = await pendingDeposit(sdk, id);
  const quote = standardFee(deposit);
  const review = Object.freeze({ id, amountSats: deposit.amountSats, feeSats: quote.feeSats, receiveSats: quote.creditAmountSats, expiresAt: Date.now() + 90_000 });
  reviews.set(review, { sdk, used: false });
  return review;
}

/** One explicit approval, capped at the reviewed fee. Never retry a claim here. */
export async function approveDepositClaim(review: DepositClaimReview): Promise<DepositClaimResult> {
  const stored = reviews.get(review);
  if (!stored || stored.used || review.expiresAt <= Date.now()) throw new Error("Review the current deposit fee before approving it.");
  if (inFlight.has(review.id)) throw new Error("This deposit is already being added.");
  stored.used = true;
  inFlight.add(review.id);
  try {
    const sdk = await connect();
    if (sdk !== stored.sdk) throw new Error("The wallet changed. Review this deposit again.");
    const deposit = await pendingDeposit(sdk, review.id);
    const current = standardFee(deposit);
    if (current.feeSats > review.feeSats || deposit.amountSats !== review.amountSats) throw new Error("The fee changed. Review the updated fee before approving it.");
    if (review.expiresAt <= Date.now()) throw new Error("The fee review expired. Review it again.");
    const { outcome } = await sdk.claimDeposit({ ...outpoint(review.id), maxFee: new MaxFee.Fixed({ amount: review.feeSats }) });
    if (outcome.tag === "Settled") return { status: "complete", paymentId: outcome.inner.payment.id };
    if (outcome.tag === "Submitted") return { status: "submitted" };
    return { status: "waiting", feeChanged: outcome.inner.reason.tag === "MaxFeeExceeded" };
  } finally { inFlight.delete(review.id); }
}
