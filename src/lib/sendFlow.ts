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

export function shortRecipient(value: string): string {
  return value.length > 36 ? `${value.slice(0, 16)}…${value.slice(-12)}` : value;
}

/** The review and balance check must include both components of a Bitcoin exit. */
export function quotedFeeSats(method: unknown): bigint {
  const inner = (method as { inner?: Record<string, unknown> })?.inner ?? {};
  const medium = (inner.feeQuote as { speedMedium?: { userFeeSat?: bigint; l1BroadcastFeeSat?: bigint } } | undefined)?.speedMedium;
  if (medium) return BigInt(medium.userFeeSat ?? 0n) + BigInt(medium.l1BroadcastFeeSat ?? 0n);
  for (const value of [inner.sparkTransferFeeSats, inner.lightningFeeSats, inner.fee]) {
    if (typeof value === "bigint" && value >= 0n) return value;
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  }
  throw new Error("Couldn't determine the payment fee. Review it again.");
}
