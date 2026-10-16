jest.mock("./wallet", () => ({ connect: jest.fn() }));
jest.mock("@breeztech/breez-sdk-spark-react-native", () => ({ MaxFee: { Fixed: class { tag = "Fixed"; constructor(public inner: { amount: bigint }) {} } } }));

import { connect } from "./wallet";
import { prepareDepositClaim, approveDepositClaim } from "./depositClaims";

const txid = "ab".repeat(32);
const id = `bitcoin-deposit:${txid}:1`;
const deposit = { txid, vout: 1, amountSats: 2000n, isMature: true,
  claimError: { tag: "MaxDepositClaimFeeExceeded", inner: { requiredFeeSats: 300n, requiredFeeRateSatPerVbyte: 3n } } };
const sdk = { listUnclaimedDeposits: jest.fn(), fetchClaimDepositQuote: jest.fn(), claimDeposit: jest.fn() };

beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(1_000_000); jest.resetAllMocks();
  jest.mocked(connect).mockResolvedValue(sdk as never);
  sdk.listUnclaimedDeposits.mockResolvedValue({ deposits: [deposit] });
  sdk.claimDeposit.mockResolvedValue({ outcome: { tag: "Settled", inner: { payment: { id: "completed-payment" } } } });
});
afterEach(() => jest.useRealTimers());

it("reviews the cheaper standard claim without approving or submitting it", async () => {
  expect(await prepareDepositClaim(id)).toMatchObject({ id, amountSats: 2000n, feeSats: 300n, receiveSats: 1700n });
  expect(sdk.fetchClaimDepositQuote).not.toHaveBeenCalled();
  expect(sdk.claimDeposit).not.toHaveBeenCalled();
});

it("rechecks state and fees, caps this output at the reviewed amount, and settles once", async () => {
  const review = await prepareDepositClaim(id);
  expect(await approveDepositClaim(review)).toEqual({ status: "complete", paymentId: "completed-payment" });
  expect(sdk.claimDeposit).toHaveBeenCalledWith({ txid, vout: 1, maxFee: expect.objectContaining({ tag: "Fixed", inner: { amount: 300n } }) });
  await expect(approveDepositClaim(review)).rejects.toThrow(/Review/);
  expect(sdk.claimDeposit).toHaveBeenCalledTimes(1);
});

it("refuses a higher fee instead of silently approving it", async () => {
  const review = await prepareDepositClaim(id);
  sdk.listUnclaimedDeposits.mockResolvedValue({ deposits: [{ ...deposit, claimError: { ...deposit.claimError, inner: { ...deposit.claimError.inner, requiredFeeSats: 400n } } }] });
  await expect(approveDepositClaim(review)).rejects.toThrow(/fee changed/);
  expect(sdk.claimDeposit).not.toHaveBeenCalled();
});

it.each([
  { isMature: false }, { refundTxId: "refund" }, { instantClaimStatus: { tag: "Submitted" } },
  { instantClaimStatus: { tag: "Claimed" } }, { maxClaimFee: { tag: "Fixed", inner: { amount: 300n } } },
])("does not submit a claim whose state changed after review: %#", async (patch) => {
  const review = await prepareDepositClaim(id);
  sdk.listUnclaimedDeposits.mockResolvedValue({ deposits: [{ ...deposit, ...patch }] });
  await expect(approveDepositClaim(review)).rejects.toThrow();
  expect(sdk.claimDeposit).not.toHaveBeenCalled();
});

it.each([
  [{ tag: "Submitted" }, { status: "submitted" }],
  [{ tag: "Deferred", inner: { reason: { tag: "MaxFeeExceeded" } } }, { status: "waiting", feeChanged: true }],
  [{ tag: "Deferred", inner: { reason: { tag: "NoEarlyClaimAvailable" } } }, { status: "waiting", feeChanged: false }],
])("retains pending outcomes without inventing a completed payment: %#", async (outcome, expected) => {
  sdk.claimDeposit.mockResolvedValue({ outcome });
  const review = await prepareDepositClaim(id);
  expect(await approveDepositClaim(review)).toEqual(expected);
  await expect(approveDepositClaim(review)).rejects.toThrow();
  expect(sdk.claimDeposit).toHaveBeenCalledTimes(1);
});

it("blocks duplicate presses even with two separately prepared reviews", async () => {
  const first = await prepareDepositClaim(id), second = await prepareDepositClaim(id);
  const claiming = approveDepositClaim(first);
  await expect(approveDepositClaim(second)).rejects.toThrow(/already/);
  await claiming;
  expect(sdk.claimDeposit).toHaveBeenCalledTimes(1);
});

it("rejects forged, expired, and previous-wallet approvals", async () => {
  const review = await prepareDepositClaim(id);
  await expect(approveDepositClaim({ ...review, feeSats: 1000n })).rejects.toThrow(/Review/);
  jest.setSystemTime(review.expiresAt + 1);
  await expect(approveDepositClaim(review)).rejects.toThrow(/Review/);
  jest.setSystemTime(1_000_000);
  const fresh = await prepareDepositClaim(id);
  jest.mocked(connect).mockResolvedValue({ ...sdk } as never);
  await expect(approveDepositClaim(fresh)).rejects.toThrow(/wallet changed/);
  expect(sdk.claimDeposit).not.toHaveBeenCalled();
});

it.each([
  { requiredFeeSats: undefined }, { requiredFeeSats: -1n },
  { requiredFeeSats: 2000n }, { requiredFeeRateSatPerVbyte: 1n },
])("requires a valid, affordable, approval-needed reported fee: %#", async (patch) => {
  sdk.listUnclaimedDeposits.mockResolvedValue({ deposits: [{ ...deposit, claimError: {
    ...deposit.claimError, inner: { ...deposit.claimError.inner, ...patch },
  } }] });
  await expect(prepareDepositClaim(id)).rejects.toThrow();
  expect(sdk.claimDeposit).not.toHaveBeenCalled();
});

it("does not wait for a hanging chain-service quote to review or approve a mature deposit", async () => {
  sdk.fetchClaimDepositQuote.mockReturnValue(new Promise(() => undefined));
  const review = await prepareDepositClaim(id);
  expect(await approveDepositClaim(review)).toEqual({ status: "complete", paymentId: "completed-payment" });
  expect(sdk.fetchClaimDepositQuote).not.toHaveBeenCalled();
  expect(sdk.claimDeposit).toHaveBeenCalledTimes(1);
});

it("does not retry an uncertain claim response", async () => {
  sdk.claimDeposit.mockRejectedValue(new Error("network response lost"));
  const review = await prepareDepositClaim(id);
  await expect(approveDepositClaim(review)).rejects.toThrow(/response lost/);
  await expect(approveDepositClaim(review)).rejects.toThrow(/Review/);
  expect(sdk.claimDeposit).toHaveBeenCalledTimes(1);
});
