/** A bridge payment completes only when both funding and delivery complete. */
export function deliveryStatus(source: "complete" | "pending" | "failed", bridge?: { complete: boolean; failed: boolean }): "complete" | "pending" | "failed" {
  if (source === "failed" || bridge?.failed) return "failed";
  if (source === "pending" || (bridge && !bridge.complete)) return "pending";
  return "complete";
}

/** A prepared quote can only submit once, including while its first result is pending. */
export function oncePayment<T>(send: () => Promise<T>): () => Promise<T> {
  let attempt: Promise<T> | undefined;
  return () => attempt ??= Promise.resolve().then(send);
}

export function quoteProblem(amount: bigint, fee: bigint, balance: bigint | null): string | null {
  if (amount <= 0n || fee < 0n) return "This payment has an invalid amount or fee.";
  return balance !== null && amount + fee > balance ? "Not enough for this payment and its fee." : null;
}

/** Fixed requests cannot be overridden; open destinations need a positive amount. */
export function sendAmount(input: { amountSats?: bigint }, entered?: bigint): bigint {
  if (input.amountSats !== undefined) {
    if (entered !== undefined && entered !== input.amountSats) throw new Error("This payment request has a fixed amount.");
    if (input.amountSats > 0n) return input.amountSats;
  } else if (entered !== undefined && entered > 0n) return entered;
  throw new Error("Enter an amount greater than zero.");
}

export function shortRecipient(value: string): string {
  return value.length > 36 ? `${value.slice(0, 16)}…${value.slice(-12)}` : value;
}

export type OnchainSpeed = "slow" | "medium" | "fast";
export type OnchainFeeOption = { speed: OnchainSpeed; feeSats: bigint };

/** Include both provider and broadcast charges for each confirmation speed. */
export function onchainFeeOptions(method: unknown): OnchainFeeOption[] {
  const quote = (method as { inner?: { feeQuote?: Record<string, { userFeeSat?: bigint; l1BroadcastFeeSat?: bigint }> } })?.inner?.feeQuote;
  if (!quote) return [];
  return (["slow", "medium", "fast"] as const).map((speed) => {
    const key = { slow: "speedSlow", medium: "speedMedium", fast: "speedFast" }[speed];
    const fee = quote[key];
    if (fee?.userFeeSat === undefined || fee.l1BroadcastFeeSat === undefined) throw new Error("Couldn't determine the payment fee. Review it again.");
    const feeSats = BigInt(fee.userFeeSat) + BigInt(fee.l1BroadcastFeeSat);
    if (feeSats < 0n) throw new Error("This payment has an invalid fee.");
    return { speed, feeSats };
  });
}

/** Prefer Economy when prices tie, and otherwise choose the actual lowest total. */
export function lowestFeeOption(options: OnchainFeeOption[]): OnchainFeeOption {
  if (!options.length) throw new Error("No Bitcoin fee options are available.");
  return options.reduce((best, option) => option.feeSats < best.feeSats ? option : best);
}

/** The review and balance check must use the selected speed's full fee. */
export function quotedFeeSats(method: unknown, speed?: OnchainSpeed): bigint {
  const inner = (method as { inner?: Record<string, unknown> })?.inner ?? {};
  const options = onchainFeeOptions(method);
  if (options.length) return (speed ? options.find((option) => option.speed === speed)! : lowestFeeOption(options)).feeSats;
  for (const value of [inner.sparkTransferFeeSats, inner.lightningFeeSats, inner.fee]) {
    if (typeof value === "bigint" && value >= 0n) return value;
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  }
  throw new Error("Couldn't determine the payment fee. Review it again.");
}
