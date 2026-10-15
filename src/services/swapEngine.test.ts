jest.mock("@react-native-async-storage/async-storage", () => {
  const disk: Record<string, string> = {};
  return {
    getItem: jest.fn(async (k: string) => disk[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { disk[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete disk[k]; }),
  };
});
jest.mock("./secure", () => ({
  getSecret: jest.fn(async () => "cc".repeat(32)), setSecret: jest.fn(async () => undefined),
}));
jest.mock("./wallet", () => ({ findHtlc: jest.fn() }));
jest.mock("./nostr", () => ({
  query: jest.fn(async () => []),
  publish: jest.fn(async (event) => event),
  sign: jest.fn((template, sk) => require("nostr-tools/pure").finalizeEvent(template, sk)),
}));
jest.mock("../store/agent", () => ({}));
jest.mock("../store/session", () => ({}));
jest.mock("../store/wallet", () => ({}));

import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { actionTemplate, rootTemplate } from "../protocol/events";
import { SWAP_PROFILE } from "../protocol/constants";
import { useSwaps, hydrateSwaps, persistPaymentBindings, swapState } from "../store/swaps";
import { closeOverdueSwap, verifyIncomingLock } from "./swapEngine";
import * as nostr from "./nostr";
import type { KeyRing } from "../lib/keys";
import { describeSwap } from "../lib/swapView";
import * as wallet from "./wallet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { encryptedSwapStorage } from "./swapStorage";
import type { PayloadBody, SwapPayload } from "../protocol/payloads";

const customerSk = generateSecretKey();
const customer = getPublicKey(customerSk);
const agentSk = generateSecretKey();
const escrowSk = generateSecretKey();
const agent = getPublicKey(agentSk);
const escrow = getPublicKey(escrowSk);
const resolver = getPublicKey(generateSecretKey());
const hash = "aa".repeat(32);
let serial = 0;
function swap(direction: "btc_to_fiat" | "fiat_to_btc" = "btc_to_fiat") {
  const root = finalizeEvent(rootTemplate({
    agent, customer, escrow, resolver, descriptorId: "bb".repeat(32),
    createdAt: 100 + serial++, expiresAt: 700,
    terms: { direction, fiat: { currency: "KES", amount: "100" },
      bitcoin: { unit: "sat", network: "spark", amount: "1000" }, payment_channel: "cash_ke_kes@2",
      deadlines: { fiat_pay_by: 4500, fiat_confirm_by: 10800 } },
  }), customerSk);
  useSwaps.getState().upsertRoot(root, agent);
  return root.id;
}
function message(id: string, body: PayloadBody) {
  useSwaps.getState().addInbox({ id: String(serial++), from: customer, to: agent, createdAt: 100,
    coordination: id, kind: "payload", payload: { v: 1, profile: SWAP_PROFILE, coordination: id,
      participants: [agent, customer], commitment_scheme: "sha256-bytes@1", ...body } as SwapPayload });
}
function announce(id: string, paymentHash = hash) {
  message(id, { type: "request", quote: "{}", private_terms: "{}", payment_hash: paymentHash });
  message(id, { type: "locked", payment_hash: paymentHash, amount: "1000", expires_at: 14400 });
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(nostr.query).mockResolvedValue([]);
  await hydrateSwaps();
  useSwaps.getState().clear();
  jest.mocked(wallet.findHtlc).mockResolvedValue({ id: "single-payment", amountSats: 1000n,
    htlc: { paymentHash: hash, status: "waiting", expiresAt: 14400 } } as wallet.WalletTx);
});

afterEach(() => jest.restoreAllMocks());

const customerRing: KeyRing = { identity: { pk: customer, sk: customerSk }, escrow: { pk: escrow, sk: escrowSk }, resolver: { pk: agent, sk: agentSk } };
const agentRing: KeyRing = { ...customerRing, identity: { pk: agent, sk: agentSk } };
function accept(id: string) {
  useSwaps.getState().addActions(id, [finalizeEvent(actionTemplate(id, id, "core/accept", undefined, [], 500), agentSk)]);
}

it("automatically expires unaccepted requests at the acceptance deadline", async () => {
  const id = swap();
  jest.spyOn(Date, "now").mockReturnValue(699_000);
  expect(await closeOverdueSwap(id, customerRing)).toBe(false);
  jest.spyOn(Date, "now").mockReturnValue(700_000);
  expect(await closeOverdueSwap(id, customerRing)).toBe(true);
  expect(swapState(useSwaps.getState().records[id]).status).toBe("expired");
});

it.each(["btc_to_fiat", "fiat_to_btc"] as const)("closes an accepted unfunded %s after its payment deadline", async (direction) => {
  const id = swap(direction); accept(id);
  const ring = direction === "btc_to_fiat" ? customerRing : agentRing;
  jest.spyOn(Date, "now").mockReturnValue(4500_000);
  jest.mocked(wallet.findHtlc).mockResolvedValue(null);
  expect(await closeOverdueSwap(id, ring)).toBe(true);
  expect(wallet.findHtlc).toHaveBeenCalledWith(expect.any(String), "out", { requireSync: true, fullHistory: true });
  const rec = useSwaps.getState().records[id];
  expect(swapState(rec).status).toBe("cancelled");
  expect(describeSwap(rec, swapState(rec), ring.identity.pk, 4500).headline).toBe("Expired");
});

it("does not close an accepted swap before its payment deadline", async () => {
  const id = swap(); accept(id);
  jest.spyOn(Date, "now").mockReturnValue(4499_000);
  expect(await closeOverdueSwap(id, customerRing)).toBe(false);
  expect(wallet.findHtlc).not.toHaveBeenCalled();
});

it("keeps an unresolved lock attempt until the possible hold expiry has passed", async () => {
  const id = swap(); accept(id);
  useSwaps.getState().patchLocal(id, { lockStartedAt: 600 });
  jest.mocked(wallet.findHtlc).mockResolvedValue(null);
  jest.spyOn(Date, "now").mockReturnValue(5000_000);
  expect(await closeOverdueSwap(id, customerRing)).toBe(false);
  jest.spyOn(Date, "now").mockReturnValue(15001_000);
  expect(await closeOverdueSwap(id, customerRing)).toBe(true);
});

it.each(["waiting", "released"] as const)("does not cancel a %s lock after the deadline", async (status) => {
  const id = swap(); accept(id);
  jest.spyOn(Date, "now").mockReturnValue(20000_000);
  jest.mocked(wallet.findHtlc).mockResolvedValue({ id: "funded", htlc: { paymentHash: hash, status, expiresAt: 14400 } } as wallet.WalletTx);
  expect(await closeOverdueSwap(id, customerRing)).toBe(false);
  expect(nostr.publish).not.toHaveBeenCalled();
});

it("closes an accepted swap once the wallet confirms its lock returned", async () => {
  const id = swap(); accept(id);
  jest.spyOn(Date, "now").mockReturnValue(20000_000);
  jest.mocked(wallet.findHtlc).mockResolvedValue({ id: "returned", timestamp: 1000, htlc: { paymentHash: hash, status: "returned", expiresAt: 14400 } } as wallet.WalletTx);
  expect(await closeOverdueSwap(id, customerRing)).toBe(true);
});

it("does not mistake an older returned payment for a newer unresolved lock attempt", async () => {
  const id = swap(); accept(id);
  useSwaps.getState().patchLocal(id, { lockStartedAt: 4000 });
  jest.spyOn(Date, "now").mockReturnValue(5000_000);
  jest.mocked(wallet.findHtlc).mockResolvedValue({ id: "old-return", timestamp: 1000, htlc: { paymentHash: hash, status: "returned", expiresAt: 14400 } } as wallet.WalletTx);
  expect(await closeOverdueSwap(id, customerRing)).toBe(false);
});

it("does not let the recipient infer that the payer never funded a lock", async () => {
  const id = swap(); accept(id);
  jest.spyOn(Date, "now").mockReturnValue(20000_000);
  jest.mocked(wallet.findHtlc).mockResolvedValue(null);
  expect(await closeOverdueSwap(id, agentRing)).toBe(false);
  expect(wallet.findHtlc).not.toHaveBeenCalled();
});

it("leaves the swap pending if the wallet check cannot establish its funding state", async () => {
  const id = swap(); accept(id);
  jest.spyOn(Date, "now").mockReturnValue(20000_000);
  jest.mocked(wallet.findHtlc).mockRejectedValue(new Error("offline"));
  await expect(closeOverdueSwap(id, customerRing)).rejects.toThrow("offline");
  expect(nostr.publish).not.toHaveBeenCalled();
  expect(swapState(useSwaps.getState().records[id]).status).toBe("accepted");
});

it("allows only one swap to verify a shared HTLC concurrently and retains the binding after reload", async () => {
  const ids = [swap(), swap()];
  ids.forEach((id) => announce(id));
  const results = await Promise.all(ids.map(verifyIncomingLock));
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const winner = ids[results.findIndex((r) => r.ok)];
  expect((await verifyIncomingLock(winner)).ok).toBe(true);
  const snapshot = jest.mocked(AsyncStorage.setItem).mock.calls.at(-1)![1];
  useSwaps.setState({ paymentBindings: {} });
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(snapshot);
  await useSwaps.persist.rehydrate();
  expect(useSwaps.getState().paymentBindings[hash].coordination).toBe(winner);
  expect((await verifyIncomingLock(ids.find((id) => id !== winner)!)).ok).toBe(false);
});

it("rejects unannounced and changed hashes without verifying the payment", async () => {
  const id = swap();
  message(id, { type: "locked", payment_hash: hash, amount: "1000", expires_at: 14400 });
  expect((await verifyIncomingLock(id)).ok).toBe(false);
  message(id, { type: "request", quote: "{}", private_terms: "{}", payment_hash: "dd".repeat(32) });
  expect((await verifyIncomingLock(id)).ok).toBe(false);
});

it("rejects a wallet transaction returned for another hash", async () => {
  const id = swap(); announce(id);
  const tx = await wallet.findHtlc(hash, "in");
  jest.mocked(wallet.findHtlc).mockResolvedValue({ ...tx!, htlc: { ...tx!.htlc!, paymentHash: "dd".repeat(32) } });
  expect((await verifyIncomingLock(id)).ok).toBe(false);
});

it("binds payment IDs across different hashes and refuses hash or ID replacement", () => {
  const first = swap(); const second = swap();
  const bind = useSwaps.getState().bindPayment;
  expect(bind(first, hash, "payment")).toBe(true);
  expect(bind(second, "dd".repeat(32), "payment")).toBe(false);
  expect(bind(first, hash, "replacement")).toBe(false);
  expect(bind(first, "dd".repeat(32), "new-payment")).toBe(false);
});

it.each([
  { amountSats: 999n },
  { htlc: { paymentHash: hash, status: "returned", expiresAt: 14400 } },
  { htlc: { paymentHash: hash, status: "waiting", expiresAt: 10000 } },
])("rejects unsafe locks %#", async (patch) => {
  const id = swap(); announce(id);
  const tx = await wallet.findHtlc(hash, "in");
  jest.mocked(wallet.findHtlc).mockResolvedValue({ ...tx!, ...patch } as wallet.WalletTx);
  expect((await verifyIncomingLock(id)).ok).toBe(false);
});

it("omits completed preimages from persisted snapshots", async () => {
  const id = swap();
  message(id, { type: "release", preimage: "ee".repeat(32) });
  useSwaps.getState().patchLocal(id, { claimedAt: 200 });
  await persistPaymentBindings();
  const written = jest.mocked(AsyncStorage.setItem).mock.calls.at(-1)![1];
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(written);
  const opened = await encryptedSwapStorage.getItem("pontmore.swaps");
  expect(opened).not.toContain("ee".repeat(32));
  expect(useSwaps.getState().records[id].inbox).toHaveLength(1);
});


it("refuses successful verification if its binding cannot be persisted", async () => {
  const id = swap(); announce(id);
  jest.mocked(AsyncStorage.setItem).mockRejectedValue(new Error("disk full"));
  try {
    await expect(verifyIncomingLock(id)).rejects.toThrow("disk full");
  } finally {
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  }
});

it("refuses a changed announcement even when the original lock was already verified", async () => {
  const id = swap(); announce(id);
  expect((await verifyIncomingLock(id)).ok).toBe(true);
  message(id, { type: "request", quote: "{}", private_terms: "{}", payment_hash: "dd".repeat(32) });
  expect((await verifyIncomingLock(id)).ok).toBe(false);
});


it("does not reuse a legacy secured payment whose cache predates bindings", async () => {
  const legacy = swap(); announce(legacy);
  const accept = finalizeEvent(actionTemplate(legacy, legacy, "core/accept", undefined, [], 500), agentSk);
  const secure = finalizeEvent(actionTemplate(legacy, accept.id, "core/secure", undefined, [], 501), escrowSk);
  useSwaps.getState().addActions(legacy, [accept, secure]);
  const candidate = swap(); announce(candidate);
  expect((await verifyIncomingLock(candidate)).ok).toBe(false);
});
