import { oncePayment, quoteProblem, shortRecipient } from "./sendFlow";

describe("send confirmation", () => {
  it("submits a quote once across rapid taps and later repeats", async () => {
    let finish!: (value: string) => void;
    const submit = jest.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const send = oncePayment(submit);
    const first = send();
    const repeated = send();
    expect(first).toBe(repeated);
    await Promise.resolve();
    expect(submit).toHaveBeenCalledTimes(1);
    finish("payment-id");
    await expect(first).resolves.toBe("payment-id");
    await expect(send()).resolves.toBe("payment-id");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not resubmit a quote after an unknown network outcome", async () => {
    const submit = jest.fn(async () => { throw new Error("Connection lost"); });
    const send = oncePayment(submit);
    await expect(send()).rejects.toThrow("Connection lost");
    await expect(send()).rejects.toThrow("Connection lost");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("includes fees in the balance check, including exact balance payments", () => {
    expect(quoteProblem(100n, 2n, 101n)).toMatch(/Not enough/);
    expect(quoteProblem(100n, 2n, 102n)).toBeNull();
    expect(quoteProblem(100n, 0n, 100n)).toBeNull();
  });

  it("rejects invalid quoted amounts and fees even before balance loads", () => {
    expect(quoteProblem(0n, 0n, null)).not.toBeNull();
    expect(quoteProblem(-1n, 0n, null)).not.toBeNull();
    expect(quoteProblem(100n, -1n, null)).not.toBeNull();
    expect(quoteProblem(100n, 1n, null)).toBeNull();
  });

  it("keeps usernames intact and distinguishes both ends of long addresses", () => {
    expect(shortRecipient("robotop@breez.tips")).toBe("robotop@breez.tips");
    const address = "bc1" + "a".repeat(50) + "z".repeat(12);
    expect(shortRecipient(address)).toBe(address.slice(0, 16) + "…" + address.slice(-12));
  });
});
