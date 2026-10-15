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
