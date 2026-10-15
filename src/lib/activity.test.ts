import type { WalletTx } from "../services/wallet";
import { matchesActivityFilter, matchesActivitySearch, paymentCategory, paymentLabel, swapPaymentPrefix } from "./activity";

const payment = (overrides: Partial<WalletTx> = {}): WalletTx => ({
  id: "payment", direction: "in", amountSats: 2000n, feeSats: 0n,
  kind: "lightning", status: "complete", timestamp: 200, ...overrides,
});

it.each(["lightning", "spark", "onchain", "other"] as const)("keeps ordinary %s payments in sent and received", (kind) => {
  expect(paymentCategory(payment({ kind }))).toBe("received");
  expect(paymentCategory(payment({ kind, direction: "out" }))).toBe("sent");
});

it.each(["Pontmore", "Pontspark"])("recognizes %s swaps and reverses agent payment direction", (brand) => {
  const incoming = payment({ description: `${brand} swap abcdef12` });
  const outgoing = { ...incoming, direction: "out" as const };
  expect(swapPaymentPrefix(incoming)).toBe("abcdef12");
  expect(paymentCategory(incoming, "customer")).toBe("add-money");
  expect(paymentCategory(outgoing, "customer")).toBe("cash-out");
  expect(paymentCategory(incoming, "agent")).toBe("cash-out");
  expect(paymentCategory(outgoing, "agent")).toBe("add-money");
  expect(paymentLabel(incoming, "agent", "Alice")).toBe("Cash out via Alice");
  expect(paymentLabel(outgoing, "customer", "Alice")).toBe("Cashed out via Alice");
});

it("includes HTLCs without descriptions in swap filters", () => {
  expect(paymentCategory(payment({ kind: "htlc" }))).toBe("add-money");
  expect(paymentCategory(payment({ kind: "htlc", direction: "out" }))).toBe("cash-out");
});

it("pending includes both incoming and outgoing payments, excluding failed and completed payments", () => {
  for (const direction of ["in", "out"] as const) {
    for (const status of ["pending", "failed", "complete"] as const) {
      const tx = payment({ direction, status });
      expect(matchesActivityFilter("pending", paymentCategory(tx), tx.status === "pending")).toBe(status === "pending");
    }
  }
  expect(matchesActivityFilter("pending", "cash-out", true)).toBe(true);
  expect(matchesActivityFilter("received", "add-money", false)).toBe(false);
  expect(matchesActivityFilter("all", "cash-out", false)).toBe(true);
});

it("searches displayed names, usernames, amounts, dates, networks and status together", () => {
  const tx = payment({ direction: "out", recipient: "alice@breez.tips" });
  const fields = [paymentLabel(tx), tx.recipient, "KES 25", "Oct 15", "Base", "pending"];
  expect(matchesActivitySearch(" ALICE  25 base ", fields)).toBe(true);
  expect(matchesActivitySearch("alice oct pending", fields)).toBe(true);
  expect(matchesActivitySearch("alice confirmed", fields)).toBe(false);
  expect(matchesActivitySearch("", fields)).toBe(true);
  expect(matchesActivitySearch("   ", [])).toBe(true);
  expect(matchesActivitySearch("jose", ["José"])).toBe(true);
});

it("combines search and filter so a matching name cannot bypass the selected category", () => {
  const tx = payment({ description: "Pontmore swap abcdef12" });
  const matches = (filter: "add-money" | "cash-out", query: string) =>
    matchesActivityFilter(filter, paymentCategory(tx), false)
      && matchesActivitySearch(query, [paymentLabel(tx, "customer", "robotop")]);
  expect(matches("add-money", "robotop")).toBe(true);
  expect(matches("cash-out", "robotop")).toBe(false);
  expect(matches("add-money", "someone else")).toBe(false);
});
